// Silent branch observes every pre-destination sample. It adds no output signal.
class HeadroomMeter extends AudioWorkletProcessor {
 constructor(){super();this.reset();this.port.onmessage=event=>{if(event.data.kind==='reset')this.reset();this.port.postMessage({id:event.data.id,value:{...this.stats,rms:this.stats.samples?Math.sqrt(this.stats.sumSquares/this.stats.samples):0}})}}
 reset(){this.stats={peak:0,sumSquares:0,samples:0,aboveOne:0,nonfinite:0,frames:0,channels:0}}
 process(inputs){const input=inputs[0]??[];this.stats.channels=Math.max(this.stats.channels,input.length);this.stats.frames+=input[0]?.length??128;for(const channel of input)for(const sample of channel){this.stats.samples++;if(!Number.isFinite(sample)){this.stats.nonfinite++;continue}this.stats.peak=Math.max(this.stats.peak,Math.abs(sample));this.stats.sumSquares+=sample*sample;if(Math.abs(sample)>1)this.stats.aboveOne++}return true}
}
registerProcessor('headroom-meter',HeadroomMeter);
