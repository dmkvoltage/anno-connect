import * as Crypto from 'expo-crypto';

export async function generateEncryptionKey(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptMessage(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const keyData = encoder.encode(key);
  
  const encryptedArray = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    encryptedArray[i] = data[i] ^ keyData[i % keyData.length];
  }
  
  return btoa(String.fromCharCode(...encryptedArray));
}

export async function decryptMessage(encrypted: string, key: string): Promise<string> {
  try {
    const encryptedData = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    
    const decryptedArray = new Uint8Array(encryptedData.length);
    for (let i = 0; i < encryptedData.length; i++) {
      decryptedArray[i] = encryptedData[i] ^ keyData[i % keyData.length];
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedArray);
  } catch (error) {
    console.error('Decryption error:', error);
    return '[Message could not be decrypted]';
  }
}
