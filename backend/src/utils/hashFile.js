import crypto from 'crypto';

export const hashFile = (fileBuffer) => {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};
