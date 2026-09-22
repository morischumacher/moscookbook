/**
 * `heic-convert` ships no declarations. Three routes each carried a
 * `@ts-expect-error` on the import and a cast on the call; this is the one
 * place either is needed now.
 */
declare module 'heic-convert' {
    interface ConvertOptions {
        buffer: ArrayBufferLike | Uint8Array;
        format: 'JPEG' | 'PNG';
        quality?: number;
    }
    function convert(options: ConvertOptions): Promise<ArrayBuffer>;
    export default convert;
}
