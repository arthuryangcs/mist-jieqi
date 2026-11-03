// Explicit optional C7; production and C6 defaults are unchanged.
import {C6Engine} from './c6-client.mjs';import {binary} from './build-c7.mjs';
export class C7Engine extends C6Engine{constructor(options={}){super({binary,...options});}}
