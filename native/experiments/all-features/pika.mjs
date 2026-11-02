import {PikaClient as FixedPika} from '../cluster-tt/pika.mjs';
export * from '../cluster-tt/pika.mjs';
export class PikaClient extends FixedPika {constructor(){super();this.reserveMs=40;}async init(){const c=await super.init();this.config={...c,hostReserveMs:this.reserveMs};return this.config;}}
