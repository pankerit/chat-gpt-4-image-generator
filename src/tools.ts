import sharp from 'sharp'
export function webpToPng(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).png().toBuffer()
    // ...
}
