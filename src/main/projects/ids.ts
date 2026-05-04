import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(ALPHABET, 16);

export function newProjectId(): string {
  return `prj_${generate()}`;
}
