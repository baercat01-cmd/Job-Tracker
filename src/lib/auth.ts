// Authentication utilities for PIN and biometric login

/**
 * Hash a PIN using SHA-256
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a PIN against a hash
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const pinHash = await hashPin(pin);
  return pinHash === hash;
}

/**
 * Check if WebAuthn is supported
 */
export function isWebAuthnSupported(): boolean {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

/**
 * Register biometric credential using WebAuthn
 */
export async function registerBiometric(userId: string, username: string) {
  if (!isWebAuthnSupported()) {
    throw new Error('Biometric authentication not supported on this device');
  }

  // Generate challenge (random bytes)
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  // Convert userId to buffer
  const userIdBuffer = new TextEncoder().encode(userId);

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'FieldTrack Pro',
      id: window.location.hostname,
    },
    user: {
      id: userIdBuffer,
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Use platform authenticators (fingerprint, Face ID)
      userVerification: 'required',
      requireResidentKey: false,
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = await navigator.credentials.create({
    publicKey: publicKeyOptions,
  }) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Failed to create credential');
  }

  // Store credential info
  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialData = {
    id: credential.id,
    rawId: arrayBufferToBase64(credential.rawId),
    type: credential.type,
    publicKey: arrayBufferToBase64(response.getPublicKey()!),
    registeredAt: new Date().toISOString(),
  };

  return credentialData;
}

/**
 * Authenticate using biometric credential
 */
export async function authenticateBiometric(
  userId: string,
  credentials: any[]
): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    throw new Error('Biometric authentication not supported on this device');
  }

  if (!credentials || credentials.length === 0) {
    throw new Error('No biometric credentials registered');
  }

  // Generate challenge
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    allowCredentials: credentials.map((cred) => ({
      id: base64ToArrayBuffer(cred.rawId),
      type: 'public-key' as const,
    })),
    userVerification: 'required',
    timeout: 60000,
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyOptions,
    });

    return !!assertion;
  } catch (error) {
    console.error('Biometric authentication failed:', error);
    return false;
  }
}

/**
 * Helper: Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper: Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
