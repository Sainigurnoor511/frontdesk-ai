import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * `fastembed` loads a native tokenizer binary (`@anush008/tokenizers`), which
   * Turbopack cannot place in an ESM server chunk — the build fails with
   * "non-ecmascript placeable asset". Marking it external makes Next `require` it
   * at runtime instead of bundling it.
   *
   * This became necessary when the AssemblyAI voice provider landed. On the
   * LiveKit path, `search_knowledge` executes inside the standalone voice worker,
   * so the embedding stack never entered the Next build. AssemblyAI's managed
   * pipeline emits `tool.call` to the browser, so the tool has to be executed by a
   * server action instead — which links `lib/data/knowledge-service` into the app.
   *
   * Operationally: the app container can now load a BGE model on demand, the
   * first time an AssemblyAI call performs a knowledge search. Set
   * `FASTEMBED_DISABLED=1` to keep the app tier on lexical-only search if that
   * memory cost is unwelcome.
   */
  serverExternalPackages: ["fastembed", "@anush008/tokenizers"],
};

export default nextConfig;
