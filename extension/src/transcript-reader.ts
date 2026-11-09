import * as fs from 'node:fs';

export interface ReadResult {
  records: unknown[];
  malformed: number;
  reset: boolean;
}

/** Reads only bytes appended since the previous call. Never writes to the file. */
export class IncrementalJsonlReader {
  private offset = 0;
  private pending: Buffer = Buffer.alloc(0);
  private identity = '';

  constructor(readonly file: string, private readonly chunkSize = 8 * 1024 * 1024) {}

  read(): ReadResult {
    const result: ReadResult = { records: [], malformed: 0, reset: false };
    let stat: fs.Stats;
    try { stat = fs.statSync(this.file); } catch { return result; }

    const identity = String(stat.birthtimeMs);
    if ((this.identity && identity !== this.identity) || stat.size < this.offset) {
      this.offset = 0;
      this.pending = Buffer.alloc(0);
      result.reset = true;
    }
    this.identity = identity;
    if (stat.size === this.offset) return result;

    const fd = fs.openSync(this.file, 'r');
    try {
      while (this.offset < stat.size) {
        const length = Math.min(this.chunkSize, stat.size - this.offset);
        const chunk = Buffer.alloc(length);
        const read = fs.readSync(fd, chunk, 0, length, this.offset);
        if (read <= 0) break;
        this.offset += read;
        const data = this.pending.length ? Buffer.concat([this.pending, chunk.subarray(0, read)]) : chunk.subarray(0, read);
        let start = 0;
        for (let end = data.indexOf(10, start); end !== -1; end = data.indexOf(10, start)) {
          const line = data.subarray(start, end).toString('utf8').trim();
          start = end + 1;
          if (!line) continue;
          try { result.records.push(JSON.parse(line)); } catch { result.malformed++; }
        }
        // An unfinished last line stays buffered until its newline arrives.
        this.pending = Buffer.from(data.subarray(start));
      }
    } finally {
      fs.closeSync(fd);
    }
    return result;
  }
}
