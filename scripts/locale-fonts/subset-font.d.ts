declare module "subset-font" {
  interface SubsetFontOptions {
    targetFormat?: "sfnt" | "truetype" | "woff2" | "woff";
  }
  export default function subsetFont(
    originalFont: Buffer,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
