import crypto from "crypto";

export function verifyAspNetIdentityV3Hash(password: string, storedHash: string): boolean {
  try {
    const hashBuffer = Buffer.from(storedHash, "base64");

    if (hashBuffer.length < 13) return false;

    const formatMarker = hashBuffer[0];

    if (formatMarker === 0x01) {
      return verifyV3(password, hashBuffer);
    } else if (formatMarker === 0x00) {
      return verifyV2(password, hashBuffer);
    }

    return false;
  } catch {
    return false;
  }
}

function verifyV3(password: string, hashBuffer: Buffer): boolean {
  const prfIndicator = hashBuffer.readUInt32BE(1);
  const iterCount = hashBuffer.readUInt32BE(5);
  const saltLength = hashBuffer.readUInt32BE(9);

  if (hashBuffer.length < 13 + saltLength) return false;

  const salt = hashBuffer.subarray(13, 13 + saltLength);
  const storedSubkey = hashBuffer.subarray(13 + saltLength);

  let algorithm: string;
  let keyLength: number;

  switch (prfIndicator) {
    case 0:
      algorithm = "sha1";
      keyLength = 20;
      break;
    case 1:
      algorithm = "sha256";
      keyLength = 32;
      break;
    case 2:
      algorithm = "sha512";
      keyLength = 64;
      break;
    default:
      return false;
  }

  if (storedSubkey.length !== keyLength) {
    keyLength = storedSubkey.length;
  }

  const derivedKey = crypto.pbkdf2Sync(password, salt, iterCount, keyLength, algorithm);

  return crypto.timingSafeEqual(derivedKey, storedSubkey);
}

function verifyV2(password: string, hashBuffer: Buffer): boolean {
  const salt = hashBuffer.subarray(1, 17);
  const storedSubkey = hashBuffer.subarray(17, 49);

  const derivedKey = crypto.pbkdf2Sync(password, salt, 1000, 32, "sha1");

  return crypto.timingSafeEqual(derivedKey, storedSubkey);
}
