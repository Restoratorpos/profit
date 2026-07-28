import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "../config/index.js";
import { AppError } from "./errors.js";

/**
 * Reversible encryption for the one kind of secret this server has to be able to
 * read back: an access terminal's admin password. Passwords for people are
 * bcrypt-hashed and never recovered — this is the opposite case, because every
 * call to the device has to present the password again.
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than decrypting
 * to rubbish that gets sent to a device. Stored as `v1.<iv>.<tag>.<data>`, all
 * base64url: the version prefix is what makes a future algorithm change a
 * migration rather than a guessing game.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;

class DeviceSecretError extends AppError {
  constructor(message: string) {
    super(500, "device_secret_unavailable", message);
  }
}

/**
 * A 32-byte key from whatever length DEVICE_SECRET happens to be. Hashing rather
 * than truncating means a short-but-high-entropy secret is not silently weakened
 * by throwing its tail away.
 */
const keyOrThrow = (): Buffer => {
  const secret = config.devices.secret;

  if (!secret) {
    throw new DeviceSecretError(
      "DEVICE_SECRET is not set — add it to apps/backend/.env.local before saving a terminal password"
    );
  }

  return createHash("sha256").update(secret).digest();
};

/** True when a terminal password can be stored at all. */
export const canStoreSecrets = (): boolean => Boolean(config.devices.secret);

export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyOrThrow(), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
};

export const decryptSecret = (stored: string): string => {
  const [version, iv, tag, data] = stored.split(".");

  if (version !== VERSION || !(iv && tag && data)) {
    throw new DeviceSecretError("Stored terminal password is unreadable");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      keyOrThrow(),
      Buffer.from(iv, "base64url")
    );

    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Wrong key or tampered payload — both mean the same thing to the operator,
    // and neither should surface a crypto stack trace.
    throw new DeviceSecretError(
      "Stored terminal password could not be decrypted — has DEVICE_SECRET changed?"
    );
  }
};
