import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export const ENCRYPTED_MARKER = '<!-- ENCRYPTED:v1 -->';

export function isEncrypted(content: string): boolean {
    return content.startsWith(ENCRYPTED_MARKER);
}

export function encrypt(text: string, password: string): string {
    // Generar salt e IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derivar clave de la contraseña
    const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
    
    // Encriptar
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Obtener auth tag
    const authTag = cipher.getAuthTag();
    
    // Combinar: marker + salt + iv + authTag + encrypted
    const result = Buffer.concat([
        salt,
        iv,
        authTag,
        Buffer.from(encrypted, 'base64')
    ]);
    
    return ENCRYPTED_MARKER + '\n' + result.toString('base64');
}

export function decrypt(encryptedContent: string, password: string): string | null {
    try {
        // Remover marker
        const content = encryptedContent.replace(ENCRYPTED_MARKER, '').trim();
        const buffer = Buffer.from(content, 'base64');
        
        // Extraer componentes
        const salt = buffer.subarray(0, SALT_LENGTH);
        const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        
        // Derivar clave
        const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
        
        // Desencriptar
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        return null; // Contraseña incorrecta o datos corruptos
    }
}
