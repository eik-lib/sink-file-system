import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReadFile } from '@eik/common';
import Sink from '@eik/sink';
import Metrics from '@metrics/client';
import mime from 'mime';
import { rimraf } from 'rimraf';

/**
 * @param {import('node:fs').Stats} stat
 * @returns {string} As etag
 */
const etagFromFsStat = (stat) => {
    const mtime = stat.mtime.getTime().toString(16);
    const size = stat.size.toString(16);
    return `W/"${size}-${mtime}"`;
};

/**
 * @typedef {object} SinkFileSystemOptions
 * @property {string} [sinkFsRootPath] Default: gets a temporary directory from the OS
 */

/**
 * A sink for persisting files to local file system. By default
 * files are stored in a temporary folder on the OS. To ensure
 * the files are persisted over time, provide a `sinkFsRootPath`.
 *
 * @example
 * ```js
 * import path from "node:path";
 * import Sink from "@eik/sink-file-system";
 *
 * const sink = new Sink({
 *   sinkFsRootPath: path.join(process.cwd(), "eik-files"),
 * });
 * ```
 */
export default class SinkFileSystem extends Sink {
    /**
     * @type {Required<SinkFileSystemOptions>}
     */
    _config;

    /** @type {import('@metrics/client')} */
    _metrics;

    /**
     * @param {SinkFileSystemOptions} options
     */
    constructor(options = {}) {
        super();
        this._config = {
            sinkFsRootPath: path.join(os.tmpdir(), '/eik-files'),
            ...options,
        };
        this._metrics = new Metrics();
        this._counter = this._metrics.counter({
            name: 'eik_core_sink_fs',
            description:
                'Counter measuring access to the file system storage sink',
            labels: {
                operation: 'n/a',
                success: false,
                access: false,
            },
        });
    }

    get metrics() {
        return this._metrics;
    }

    /**
     * @param {string} filePath
     * @param {string} contentType
     * @returns {Promise<import('node:stream').Writable>}
     */
    write(filePath, contentType) {
        return new Promise((resolve, reject) => {
            const operation = 'write';

            try {
                Sink.validateFilePath(filePath);
                Sink.validateContentType(contentType);
            } catch (error) {
                this._counter.inc({ labels: { operation } });
                reject(error);
                return;
            }

            const pathname = path.join(this._config.sinkFsRootPath, filePath);

            if (pathname.indexOf(this._config.sinkFsRootPath) !== 0) {
                this._counter.inc({ labels: { operation } });
                reject(new Error(`Directory traversal - ${filePath}`));
                return;
            }

            const dir = path.dirname(pathname);

            fs.mkdir(
                dir,
                {
                    recursive: true,
                },
                (error) => {
                    if (error) {
                        this._counter.inc({
                            labels: { access: true, operation },
                        });
                        reject(
                            new Error(`Could not create directory - ${dir}`),
                        );
                        return;
                    }

                    const stream = fs.createWriteStream(pathname, {
                        autoClose: true,
                        emitClose: true,
                    });

                    this._counter.inc({
                        labels: {
                            success: true,
                            access: true,
                            operation,
                        },
                    });

                    resolve(stream);
                },
            );
        });
    }

    /**
     * @param {string} filePath
     * @throws {Error} if the file does not exist
     * @returns {Promise<import('@eik/common').ReadFile>}
     */
    read(filePath) {
        return new Promise((resolve, reject) => {
            const operation = 'read';

            try {
                Sink.validateFilePath(filePath);
            } catch (error) {
                this._counter.inc({ labels: { operation } });
                reject(error);
                return;
            }

            const pathname = path.join(this._config.sinkFsRootPath, filePath);

            if (pathname.indexOf(this._config.sinkFsRootPath) !== 0) {
                this._counter.inc({ labels: { operation } });
                reject(new Error(`Directory traversal - ${filePath}`));
                return;
            }

            const closeFd = (fd) => {
                fs.close(fd, (error) => {
                    if (error) {
                        this._counter.inc({
                            labels: {
                                access: true,
                                operation,
                            },
                        });
                        return;
                    }
                    this._counter.inc({
                        labels: {
                            success: true,
                            access: true,
                            operation,
                        },
                    });
                });
            };

            fs.open(pathname, 'r', (error, fd) => {
                if (error) {
                    this._counter.inc({
                        labels: {
                            access: true,
                            operation,
                        },
                    });
                    reject(error);
                    return;
                }

                fs.fstat(fd, (err, stat) => {
                    if (err) {
                        closeFd(fd);
                        reject(err);
                        return;
                    }

                    if (!stat.isFile()) {
                        closeFd(fd);
                        reject(new Error(`Not a file - ${pathname}`));
                        return;
                    }

                    const mimeType =
                        mime.getType(pathname) || 'application/octet-stream';
                    const etag = etagFromFsStat(stat);

                    const obj = new ReadFile({
                        mimeType,
                        etag,
                    });

                    obj.stream = fs.createReadStream(pathname, {
                        autoClose: true,
                        fd,
                    });

                    obj.stream.on('error', () => {
                        this._counter.inc({
                            labels: {
                                access: true,
                                operation,
                            },
                        });
                    });

                    obj.stream.on('end', () => {
                        this._counter.inc({
                            labels: {
                                success: true,
                                access: true,
                                operation,
                            },
                        });
                    });

                    resolve(obj);
                });
            });
        });
    }

    /**
     * @param {string} filePath
     * @returns {Promise<void>}
     */
    delete(filePath) {
        return new Promise((resolve, reject) => {
            const operation = 'delete';

            try {
                Sink.validateFilePath(filePath);
            } catch (error) {
                this._counter.inc({ labels: { operation } });
                reject(error);
                return;
            }

            const pathname = path.join(this._config.sinkFsRootPath, filePath);

            if (pathname.indexOf(this._config.sinkFsRootPath) !== 0) {
                this._counter.inc({ labels: { operation } });
                reject(new Error(`Directory traversal - ${filePath}`));
                return;
            }

            rimraf(pathname)
                .then(() => {
                    this._counter.inc({
                        labels: {
                            success: true,
                            access: true,
                            operation,
                        },
                    });
                    resolve();
                })
                .catch((error) => {
                    this._counter.inc({ labels: { access: true, operation } });
                    reject(error);
                });
        });
    }

    /**
     * @param {string} filePath
     * @throws {Error} if the file does not exist
     * @returns {Promise<void>}
     */
    exist(filePath) {
        return new Promise((resolve, reject) => {
            const operation = 'exist';

            try {
                Sink.validateFilePath(filePath);
            } catch (error) {
                this._counter.inc({ labels: { operation } });
                reject(error);
                return;
            }

            const pathname = path.join(this._config.sinkFsRootPath, filePath);

            if (pathname.indexOf(this._config.sinkFsRootPath) !== 0) {
                this._counter.inc({ labels: { operation } });
                reject(new Error(`Directory traversal - ${filePath}`));
                return;
            }

            fs.stat(pathname, (error, stat) => {
                this._counter.inc({
                    labels: { success: true, access: true, operation },
                });

                if (stat && stat.isFile()) {
                    resolve();
                    return;
                }

                if (error) {
                    reject(error);
                    return;
                }
                reject();
            });
        });
    }

    get [Symbol.toStringTag]() {
        return 'SinkFileSystem';
    }
}
