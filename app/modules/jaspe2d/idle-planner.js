// Time is the visible animation clock, so hidden tabs never accumulate idle acts.
export const waitingActivities = Object.freeze([
  {id:'leanPanel', label:'S’adosser au panneau', fullBody:true, status:'key-pose-draft'},
  {id:'walk', label:'Quelques pas sur place', fullBody:true, status:'existing-prototype', automatic:false},
  {id:'standRelaxed', label:'Se redresser doucement', fullBody:true, status:'frames-needed'},
  {id:'sitChair', label:'S’asseoir puis se relever', fullBody:true, status:'key-pose-draft'},
  {id:'readBook', label:'Ouvrir, lire et refermer le livre', fullBody:false, status:'key-pose-draft'},
  {id:'joySway', label:'Attendre avec un léger balancement', fullBody:true, status:'existing-prototype'},
  {id:'attentive', label:'Attendre avec attention', fullBody:false, status:'existing-prototype'},
]);

export class IdlePlanner {
  constructor(){this.lastActivity=0;this.nextAt=1700;this.welcomed=false;this.cursor=0;}
  activity(clock){this.welcomed=true;this.lastActivity=clock;this.nextAt=Math.max(this.nextAt,clock+25000);}
  next({clock,typing=false,idle=true,bust=false,ready=()=>false,duration=()=>0}) {
    if(typing||!idle||clock<this.nextAt)return null;
    if(!this.welcomed){
      this.welcomed=true;
      this.nextAt=clock+duration('wave')+25000;
      return ready('wave')?'wave':null;
    }
    if(clock-this.lastActivity<25000)return null;
    // New key poses cannot become live animations merely by being listed here.
    const eligible=waitingActivities.filter(item=>item.status==='existing-prototype'&&item.automatic!==false&&(!bust||!item.fullBody)&&ready(item.id));
    if(!eligible.length){this.nextAt=clock+25000;return null;}
    const chosen=eligible[this.cursor++%eligible.length].id;
    this.nextAt=clock+duration(chosen)+28000;
    return chosen;
  }
}
