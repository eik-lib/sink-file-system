# @eik/sink-file-system

Sink implementation that persists files on the local file system.

## Usage

```sh
npm install @eik/sink-file-system
```

```js
import path from 'node:path';
import { pipeline } from 'node:stream';
import Sink from '@eik/sink-file-system';
import express from 'express';

const app = express();
const sink = new Sink({
    sinkFsRootPath: path.join(process.cwd(), 'eik-files'),
});

app.get('/file.js', async (req, res, next) => {
    try {
        const file = await sink.read('/path/to/file/file.js');
        pipeline(file.stream, res, (error) => {
            if (error) return next(error);
        });
    } catch (error) {
        next(error);
    }
});

app.listen(8000);
```

## API

The sink instance has the following API:

### .write(filePath, contentType)

Method for writing a file to storage.

This method takes the following arguments:

-   `filePath` - String - Path to the file to be stored - Required.
-   `contentType` - String - The content type of the file - Required.

Resolves with a writable stream.

```js
import { pipeline } from 'node:stream';

const fromStream = new SomeReadableStream();
const sink = new Sink({ ... });

try {
    const file = await sink.write('/path/to/file/file.js', 'application/javascript');
    pipeline(fromStream, file.stream, (error) => {
        if (error) console.log(error);
    });
} catch (error) {
    console.log(error);
}
```

### .read(filePath)

Method for reading a file from storage.

This method takes the following arguments:

-   `filePath` - String - Path to the file to be read - Required.

Resolves with a [ReadFile][read-file] object which holds metadata about
the file and a readable stream with the byte stream of the file on the
`.stream` property.

```js
import { pipeline } from 'node:stream';

const toStream = new SomeWritableStream();
const sink = new Sink({ ... });

try {
    const file = await sink.read('/path/to/file/file.js');
    pipeline(file.stream, toStream, (error) => {
        if (error) console.log(error);
    });
} catch (error) {
    console.log(error);
}
```

### .delete(filePath)

Method for deleting a file in storage.

This method takes the following arguments:

-   `filePath` - String - Path to the file to be deleted - Required.

Resolves if file is deleted and rejects if file could not be deleted.

```js
const sink = new Sink({ ... });

try {
    await sink.delete('/path/to/file/file.js');
} catch (error) {
    console.log(error);
}
```

### .exist(filePath)

Method for checking if a file exist in the storage.

This method takes the following arguments:

-   `filePath` - String - Path to the file to be checked for existence - Required.

Resolves if file exists and rejects if file does not exist.

```js
const sink = new Sink({ ... });

try {
    await sink.exist('/path/to/file/file.js');
} catch (error) {
    console.log(error);
}
```

[eik]: https://github.com/eik-lib
[read-file]: https://github.com/eik-lib/common/blob/master/lib/classes/read-file.js
