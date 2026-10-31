export interface TestRsaKey {
  /** The PKCS#8 private key as PEM, the format `GITHUB_APP_PRIVATE_KEY` expects. */
  privateKeyPem: string;
  publicKey: CryptoKey;
}

/** Generates a throwaway RS256 key pair, so no test ever needs a real GitHub App key. */
export async function generateTestRsaKey(): Promise<TestRsaKey> {
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  let binary = "";
  for (const byte of pkcs8) {
    binary += String.fromCodePoint(byte);
  }
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  const privateKeyPem = [
    "-----BEGIN PRIVATE KEY-----",
    ...lines,
    "-----END PRIVATE KEY-----",
    "",
  ].join("\n");
  return { privateKeyPem, publicKey: keyPair.publicKey };
}
