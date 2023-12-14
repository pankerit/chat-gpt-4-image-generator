import fs from 'fs-extra'
import * as esbuild from 'esbuild'
import { execSync } from 'child_process'
import externalizeAllPackagesExcept from 'esbuild-plugin-noexternal'

async function main() {
    await esbuild.build({
        entryPoints: ['./src/index.ts'],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: './dist/index.js',
        external: ['sharp', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
    })
    execSync('yarn pkg dist/index.js --targets host --output GPT4ImageGenerator', {
        cwd: process.cwd(),
        stdio: 'inherit',
    })
}

main().catch((e) => {
    console.log(e.message)
})
