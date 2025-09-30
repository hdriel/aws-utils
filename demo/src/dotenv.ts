import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import path from 'pathe';

const ENV_FILE_PATH = path.join(process.env.NODE_ENV === 'development' ? '.env.dev' : '.env.local');
console.log(`loading env file: '${ENV_FILE_PATH}'`);

const myEnv = dotenv.config({ path: ENV_FILE_PATH });
expand(myEnv);

console.table(myEnv.parsed);

export default myEnv.parsed;
