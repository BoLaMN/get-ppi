const DEFAULT_RESOLUTION = 72;

const EXIF_MARKER = 0x45786966;
const JFIF_MARKER = 0x4a464946;

const isEXIF = (data) => data.getUint16(2) === 0xffe1 && data.getUint32(6) === EXIF_MARKER;
const isJFIF = (data) => data.getUint32(6) === JFIF_MARKER;
const isPNG = (data) => data.getUint8(1) === 80 && data.getUint8(2) === 78 && data.getUint8(3) === 71;

const isLittleEndian = (value) => {
    if (value === 0x4949) {
        return true;
    }

    if (value === 0x4d4d) {
        return false;
    }

    throw new Error('TIFF Byte Order');
};

const getRational = (dataView, pos, littleEndian) => {
    let start = dataView.getUint32(pos + 8, littleEndian) + 12;
    let numerator = dataView.getUint32(start, littleEndian);
    let denominator = dataView.getUint32(start + 4, littleEndian);

    return numerator / denominator;
};

const normalizeResolution = (x, y, unit) => {
    if (x !== y) {
        console.warn('Non-square pixels detected. Falling back to default resolution.');
        return DEFAULT_RESOLUTION;
    }

    let resolutionPpi;

    switch (unit) {
        case 2: // inch
            resolutionPpi = x;
            break;
        case 3: // cm
            resolutionPpi = x * 2.54;
            break;
        case 4: // png
            resolutionPpi = Math.round(x / 39.37007874015748);
            break;
    }

    return resolutionPpi || DEFAULT_RESOLUTION;
};

const getJfifResolution = (dataView) => {
    let ResolutionUnit = dataView.getUint8(13) + 1;
    let XResolution = dataView.getUint16(14);
    let YResolution = dataView.getUint16(16);

    return normalizeResolution(XResolution, YResolution, ResolutionUnit);
};

const getJpgResolution = (dataView) => {
    let XResolution;
    let YResolution;
    let ResolutionUnit;

    const littleEndian = isLittleEndian(dataView.getUint16(12));

    let pos = dataView.getUint32(16, littleEndian) + 12;
    let start = pos + 2;
    let i = 0;

    const count = dataView.getUint16(pos, littleEndian);

    while (i < count) {
        let tag = dataView.getUint16(start, littleEndian);

        switch (tag) {
            case 282:
                XResolution = getRational(dataView, start, littleEndian);
                break;
            case 283:
                YResolution = getRational(dataView, start, littleEndian);
                break;
            case 296:
                ResolutionUnit = dataView.getUint16(start + 8, littleEndian);
                break;
        }

        i += 1;
        start += 12;
    }

    return normalizeResolution(XResolution, YResolution, ResolutionUnit);
};

const getPngResolution = (dataView) => {
    let XResolution;
    let YResolution;
    let ResolutionUnit;

    let pos = 8;

    while (pos < dataView.byteLength) {
        let length = dataView.getUint32(pos);
        pos += 4;

        let type = String.fromCharCode(
          dataView.getUint8(pos),
          dataView.getUint8(pos + 1),
          dataView.getUint8(pos + 2),
          dataView.getUint8(pos + 3)
        );

        pos += 4;

        switch (type) {
            case 'pHYs': {
                XResolution = dataView.getUint32(pos);
                YResolution = dataView.getUint32(pos + 4);
                ResolutionUnit = dataView.getUint8(pos + 8) + 3;

                break;
            }
            case 'IEND': {
                break;
            }
        }

        pos += length + 4;
    }

    return normalizeResolution(XResolution, YResolution, ResolutionUnit);
};

const toDataView = (data) => {
  if (data instanceof Int8Array || data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof Buffer) {
    return new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  if (data instanceof ArrayBuffer) {
    return new DataView(data)
  }

  return data
}

const getImageResolution = (data) => {
    const dataView = toDataView(data)

    try {
        if (isEXIF(dataView)) {
            return getJpgResolution(dataView);
        }

        if (isJFIF(dataView)) {
            return getJfifResolution(dataView);
        }
        if (isPNG(dataView)) {
            return getPngResolution(dataView);
        }

        return DEFAULT_RESOLUTION;
    } catch (e) {
        return DEFAULT_RESOLUTION;
    }
};

export default getImageResolution;