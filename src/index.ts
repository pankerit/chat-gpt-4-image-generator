import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs-extra'
import path from 'path'
import axios from 'axios'
import { webpToPng } from './tools'
import { ExcelParser } from './ExcelParser'
import ora, { Ora } from 'ora'
puppeteer.use(StealthPlugin())

async function main() {
    console.log(ROOT_PATH())
    const spinner = ora('Loading GPT Chat').start()
    const browser = await puppeteer.launch({
        headless: false,
    })
    const page = await browser.newPage()
    await page.goto('https://chat.openai.com/')
    await waitForSelector(page, '#enforcement-containergpt35', 40000000)
    spinner.succeed('GPT Chat loaded')
    const files = fs.readdirSync(ROOT_PATH('input'))
    for (const file of files) {
        if (file.startsWith('~$') || file.startsWith('.DS_Store')) continue
        spinner.start(`Processing ${file}`)
        const inputFileName = file.split('.')[0]
        const outputFile = (...args: string[]) => ROOT_PATH('output', inputFileName, ...args)
        const inputWorkbook = new ExcelParser(ROOT_PATH('input', file))
        const inputSheet = inputWorkbook.getSheet(inputWorkbook.sheetNames[0])
        await page.goto('https://chat.openai.com/g/g-2fkFE8rbu-dall-e')
        await sleepWithOra(5000, spinner)
        let k = 1
        for (let i = 1; i < inputSheet.data.length; i++) {
            const functionReset = async () => {
                await page.goto('https://chat.openai.com/g/g-2fkFE8rbu-dall-e')
                k = 1
                i--
            }
            const MEDIA_ID = inputSheet.data[i][0]
            const MEDIA_PROMPT = inputSheet.data[i][1]
            if (fs.existsSync(outputFile(`${MEDIA_ID}_1.png`))) continue
            spinner.text = `Processing ${file} ${i}/${inputSheet.data.length}`
            // wait for prompt to load
            try {
                await waitForSelector(page, `button[data-testid="send-button"]`, 1000 * 60)
                await page.type('#prompt-textarea', MEDIA_PROMPT)
            } catch (error) {
                console.log(error)
                await functionReset()
                continue
            }

            await page.keyboard.press('Enter')
            // check if limit reached
            {
                await sleepWithOra(10_000, spinner)
                const promptText = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll(`[data-testid*="conversation-turn-"]`))
                    const gptResponse = elements.at(-1) as HTMLElement
                    return gptResponse.innerText
                })
                const timeToWait = calculateWaitTime(promptText)
                if (timeToWait) {
                    // log the time in hour and minutes
                    spinner.text = `Waiting ${new Date(Date.now() + timeToWait).toLocaleTimeString()}`
                    await sleepWithOra(timeToWait, spinner)
                    await functionReset()
                    continue
                }
            }
            const imageSelector = `[data-testid="conversation-turn-${k++ * 2 + 1}"] [aria-label="Show Image"] img`
            try {
                await waitForSelector(page, imageSelector)
            } catch (error) {
                console.log(error)
                await functionReset()
                continue
            }
            const imageSources = await page.evaluate((imageSelector) => {
                const images = document.querySelectorAll(imageSelector)
                const sources: string[] = []
                for (const image of images) {
                    sources.push(image.getAttribute('src')!)
                }
                return sources
            }, imageSelector)
            for (let i = 0; i < imageSources.length; i++) {
                const imageSource = imageSources[i]
                // webp format
                const { data } = await axios.get(imageSource, { responseType: 'arraybuffer' })
                const pngBuffer = await webpToPng(data)
                fs.ensureDirSync(outputFile())
                fs.writeFileSync(outputFile(`${MEDIA_ID}_${i + 1}.png`), pngBuffer)
            }
            if (k % 20 === 0) {
                await page.goto('https://chat.openai.com/g/g-2fkFE8rbu-dall-e')
                await sleepWithOra(5000, spinner)
                k = 1
            }
            await sleepWithOra(30_000, spinner)
        }
        spinner.succeed(`Processed ${file}`)
    }
}

main()

function getExecutablePathForChromeOnMac() {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

async function waitForSelector(page, selector, timeout = 120000) {
    const startTime = Date.now() // Record the start time

    async function attempt() {
        try {
            await page.waitForSelector(selector, { timeout: 5000 })
            await sleep(2000)
        } catch (error) {
            // Check if the timeout has been exceeded
            if (Date.now() - startTime > timeout) {
                throw new Error(`Timeout exceeded: Unable to find selector ${selector} within ${timeout} ms`)
            }

            // If not, try again
            await attempt()
        }
    }

    await attempt()
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function ROOT_PATH(...args: string[]) {
    return path.join(process.env.PWD!, ...args)
}

function calculateWaitTime(apiMessage: string): number | null {
    // Extract the time from the message
    const timeRegex = /(\d+):(\d+)\s*(AM|PM)/
    const match = apiMessage.match(timeRegex)

    if (!match) {
        return null
    }

    // Parse the time
    let [_, _hours, _minutes, period] = match
    let hours = parseInt(_hours)
    let minutes = parseInt(_minutes)

    // Convert 12-hour format to 24-hour format
    if (period === 'PM' && hours < 12) {
        hours += 12
    }
    if (period === 'AM' && hours === 12) {
        hours = 0
    }

    // Get current time
    const now = new Date()
    const currentTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())

    // Set the API available time
    const apiAvailableTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)

    // Calculate the wait time in milliseconds
    let waitTime = apiAvailableTime.getTime() - currentTime.getTime()

    // If the time is in the past, assume the next available time is the next day
    if (waitTime < 0) {
        apiAvailableTime.setDate(apiAvailableTime.getDate() + 1)
        waitTime = apiAvailableTime.getTime() - currentTime.getTime()
    }

    // Add one minute (60,000 milliseconds) to the wait time
    waitTime += 60000

    return waitTime
}

function sleepWithOra(ms: number, spinner: Ora) {
    const prevText = spinner.text
    const startTime = Date.now() + ms
    return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
            spinner.text = `Sleep ${Math.round((startTime - Date.now()) / 1000)} seconds`
        }, 100)
        setTimeout(() => {
            clearInterval(interval)
            spinner.text = prevText
            resolve()
        }, ms)
    })
}
