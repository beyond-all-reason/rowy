// TypeScript 4.9's lib.dom predates the Compression Streams API, which
// `components/startbox/modoption.ts` uses for the zlib payload of the
// startbox modoption value.
// https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API

type CompressionFormat = "deflate" | "deflate-raw" | "gzip";

declare class CompressionStream {
  constructor(format: CompressionFormat);
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

declare class DecompressionStream {
  constructor(format: CompressionFormat);
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}
