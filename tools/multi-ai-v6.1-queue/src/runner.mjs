/** Sequential, single-flight API executor. No scraping of third-party member websites. */
export class QueueRunner {
  constructor(engine,client,{pollMs=1400}={}){
    this.engine=engine;this.client=client;this.pollMs=pollMs;
    this.busy=false;this.stopping=false;this.timer=null;this.controller=null;this.inflight=null;
  }
  start(){
    if(this.timer)return;
    this.stopping=false;
    this.timer=setInterval(()=>this.tick().catch(e=>console.error('队列调度错误:',e.message)),this.pollMs);
    void this.tick().catch(e=>console.error('队列调度错误:',e.message));
  }
  async stop(){
    this.stopping=true;
    if(this.timer)clearInterval(this.timer);
    this.timer=null;
    this.controller?.abort();
    if(this.inflight)await this.inflight;
  }
  async tick(){
    if(this.busy||this.stopping)return;
    const jobs=this.engine.listJobs().filter(x=>x.status==='running');
    for(const j of jobs){
      if(this.stopping)return;
      const c=this.engine.current(j.id);
      if(c.stage?.status!=='ready_api')continue;
      const stageId=c.stage.id;
      if(!this.engine.claimApi(j.id,stageId))continue;
      this.busy=true;
      this.controller=new AbortController();
      this.inflight=(async()=>{
        try{
          const prompt=this.engine.preparePrompt(j.id);
          const response=await this.client.chat({model:c.stage.model,prompt,signal:this.controller.signal});
          this.engine.importReply(j.id,response.content,{kind:'api',stageId,model:response.model,usage:response.usage});
        }catch(error){
          try{this.engine.failApi(j.id,stageId,error)}catch(e){console.error('API失败记录异常:',e.message)}
        }
      })();
      try{await this.inflight}
      finally{this.inflight=null;this.controller=null;this.busy=false}
      return;
    }
  }
}
