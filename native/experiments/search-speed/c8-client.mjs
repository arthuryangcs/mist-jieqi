// Explicit optional C8; production, C6 and C7 defaults are unchanged.
import {C6Engine} from './c6-client.mjs';import {binary} from './build-c8.mjs';
export class C8Engine extends C6Engine{constructor(options={}){super({binary,...options});}}
