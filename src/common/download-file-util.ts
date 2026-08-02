import path from "path";

const contentTypeExtensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-flac": "flac",
    "audio/x-m4a": "m4a",
    "audio/x-wav": "wav",
};

export function extensionFromUrl(url: string): string | null {
    try {
        const ext = path.extname(new URL(url).pathname).slice(1).toLowerCase();
        return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
    } catch {
        return null;
    }
}

export function extensionFromContentDisposition(value: string | null): string | null {
    if (!value) {
        return null;
    }
    const encodedFileName = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    let fileName = value.match(/filename=["']?([^;"']+)/i)?.[1];
    if (encodedFileName) {
        try {
            fileName = decodeURIComponent(encodedFileName);
        } catch {
            fileName = encodedFileName;
        }
    }
    const ext = fileName ? path.extname(fileName.trim()).slice(1).toLowerCase() : "";
    return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

export function resolveMediaFilePath(filePath: string, response: Pick<Response, "headers" | "url">): string {
    const contentDispositionExt = extensionFromContentDisposition(
        response.headers.get("content-disposition"),
    );
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const responseExt = extensionFromUrl(response.url);
    const ext = contentDispositionExt || contentTypeExtensions[contentType] || responseExt;

    if (!ext) {
        return filePath;
    }
    return path.resolve(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.${ext}`);
}
