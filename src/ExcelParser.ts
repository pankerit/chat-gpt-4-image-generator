import xlsx, { WorkBook } from 'xlsx'
import { parse } from 'papaparse'
import fs from 'fs'
import { hash } from './types'

export class ExcelParser {
    private workbook: WorkBook

    constructor(private path: string) {
        this.workbook = xlsx.read(fs.readFileSync(this.path))
    }
    public getSheet(sheet: string, iMapping = 0, jMapping = 0) {
        if (!this.workbook.SheetNames.includes(sheet)) throw `ExcelParser: sheet ${sheet} not found`
        const shet = this.workbook.Sheets[sheet]
        const csv = xlsx.utils.sheet_to_csv(shet)
        const data = this.parseCsv(csv)
        const iHash: hash = data.reduce((acc, cur, idx) => {
            const key = cur[iMapping].trim()
            if (!key) return acc
            // @ts-ignore
            acc[key] = idx
            return acc
        }, {})
        const jHash: hash = data[jMapping].reduce((acc, cur, idx) => {
            const key = cur.trim()
            if (!key) return acc
            // @ts-ignore
            acc[key] = idx
            return acc
        }, {})
        return {
            data,
            iHash,
            jHash,
        }
    }
    private parseCsv(csv: string) {
        const { data } = parse<string[]>(csv)
        data[0][0] = '.'
        const result = data as string[][]
        return result.filter((row) => row[0])
    }
    public get sheetNames() {
        return this.workbook.SheetNames
    }
}
