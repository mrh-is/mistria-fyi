import { prepareGameAssets } from "./asset-input.js";

export async function setup(): Promise<void> {
  const { assetsDir } = await prepareGameAssets(process.env.MISTRIA_ASSETS);
  process.env.MISTRIA_ASSETS = assetsDir;
}
