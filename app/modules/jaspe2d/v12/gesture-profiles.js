import {emotionalFamilies} from './emotion-performances.js';
import {clamp,smooth,photoMix} from './motion.js';

// One shared performance definition associates attention, expression and timing.
// Expressions have preparation / hold / recovery, not just a static action label.
export const gestureProfiles={
 noseScratch:{description:'Main au visage, contact léger du doigt sur le côté du nez puis retour au repos',expression:'smile'},
 intro:{description:'Salut, main sur soi puis main ouverte vers l’utilisateur pendant la présentation',expression:'smile'},
 thumbsUp:{description:'Le pouce monte devant elle avec un sourire pour dire très bien',expression:'beaming'},
 deepThink:{description:'Les doigts se posent au menton, regard pensif et pied qui tapote',expression:'thoughtful'},
 pointLeft:{description:'L’index indique la gauche de l’écran et le regard accompagne la main',expression:'smile'},
 pointRight:{description:'L’index indique la droite de l’écran et le regard accompagne la main',expression:'smile'},
 attentive:{description:'Mains proches, regard attentif et buste orienté vers l’utilisateur',expression:'neutral'},
 surpriseGesture:{description:'Sourcils hauts, bouche arrondie, mains ouvertes et léger recul',expression:'surprise'},
 footTap:{description:'Un pied tapote pendant que l’autre reste en appui',expression:'neutral'},
 heelPlay:{description:'Petit relevé de talon, alternativement à gauche et à droite',expression:'smile'},
 toePlay:{description:'Les pointes se relèvent tour à tour, talon en appui',expression:'smile'},
 sideStep:{description:'Un petit pas latéral, puis le pied revient en place',expression:'smile'},
 angry:{description:'Sourcils froncés, lèvres serrées, bras croisés et petit pas en arrière',expression:'angry'},
 compliment:{description:'Sourire chaleureux, présentation des mains puis applaudissements pour féliciter',expression:'beaming'},
 guide:{description:'Main vers la direction à suivre, puis index et regard vers l’élément',expression:'smile'},
 reassure:{description:'Sourire doux, mains ouvertes et mouvements calmes',expression:'smile'},
 jump:{description:'Préparation, impulsion, petit saut et réception sur les pieds',expression:'beaming'},
 walk:{description:'Pas alternés et balancement du bras opposé, avec sourire',expression:'smile'},
 joySway:{description:'Balancement joyeux, petits appuis et jupe qui accompagne le corps',expression:'beaming'},
 curtsy:{description:'Mains près de la jupe, regard baissé et petite révérence respectueuse',expression:'smile'},
 talkContinuous:{description:'Parole prolongée avec quatre gestes, jusqu’à Terminer',expression:'smile'},
 idle:{description:'Respiration, regard calme et petits changements d’appui',expression:'neutral'},
 settle:{description:'Les mains et les appuis reviennent au repos',expression:'neutral'},
 fidget:{description:'Deux mains sur la jupe, sourire discret et balancement des épaules',expression:'smile'},
 beam:{description:'Grand sourire : lèvres, joues et regard souriant ensemble',expression:'beaming'},
 think:{description:'Main aux cheveux, tête légèrement penchée et regard pensif',expression:'thoughtful'},
 insight:{description:'Elle réfléchit, puis montre une idée avec un sourire',expression:'thoughtful'},
 no:{description:'Index levé, tête de gauche à droite et un pied qui tapote, autre pied en appui',expression:'thoughtful'},
 yes:{description:'Hochement de tête, sourire et petite ponctuation du corps',expression:'smile'},
 sendStanding:{description:'Debout, elle regarde ses mains réunies puis accompagne les émojis du regard',expression:'smile'},
 sendKneeling:{description:'Elle descend sur un genou, réunit les mains et se relève après l’envoi',expression:'smile'},
 hips:{description:'Mains aux hanches, épaules détendues et petit sourire',expression:'smile'},
 balance:{description:'Sourire joueur et équilibre sur la jambe porteuse',expression:'smile'},
 wave:{description:'Regard vers l’utilisateur et sourire pendant le salut',expression:'smile'},
 clap:{description:'Sourire et petites ponctuations du corps pendant les applaudissements',expression:'smile'},
 wink:{description:'Clin d’œil accompagné d’un sourire et d’une petite inclinaison',expression:'smile'},
 blink:{description:'Paupières mobiles, visage détendu',expression:'neutral'},
 explain:{description:'Le regard accompagne la main et les lèvres articulent doucement',expression:'neutral'}
};
for(const [id,def]of Object.entries(emotionalFamilies))gestureProfiles[id]={description:def.description,expression:id};
export function gesturePerformance(action,elapsed,frame,duration){
 const def=gestureProfiles[action]||gestureProfiles.idle;
 const active=duration?smooth(elapsed/650)*(1-smooth((elapsed-(duration-650))/650)):0;
 const mix=photoMix(frame);
 const contribution=pose=>(frame.from===pose?1-mix:0)+(frame.to===pose?mix:0);
 const atHair=contribution('think'),pointing=contribution('pointer');
 const cups=contribution('cups')+contribution('kneel');
 let expression=def.expression,strength=action==='idle'?0:active;
 const head={roll:0,pitch:0},gaze=[0,0];
 if(action==='think'||action==='insight'){
  head.roll=-.042*atHair;head.pitch=.012*atHair;
  gaze[0]=-1.25*active;gaze[1]=-.65*atHair;
  if(action==='insight'&&pointing>.4){expression='beaming';gaze[0]=-1.6*pointing;gaze[1]=-.25*pointing;}
 }
 if(action==='sendStanding'||action==='sendKneeling'){
  const cue=action==='sendStanding'?1450:3400,follow=smooth((elapsed-cue)/650);
  gaze[1]=.9*cups*(1-follow)-.35*cups*follow;gaze[0]=1.2*cups*follow;
  head.pitch=.022*cups*(1-follow);
 }
 if(action==='fidget'){head.roll=.012*Math.sin(elapsed/1000*2.7)*active;strength*=.75;}
 if(action==='talkContinuous')strength=.6;
 if(action==='reassure')strength*=.65;
 if(action==='deepThink'){head.roll=-.025*active;gaze[0]=.8*active;gaze[1]=-.8*active;}
 if(action==='pointLeft')gaze[0]=-1.6*active;
 if(action==='pointRight')gaze[0]=1.6*active;
 if(action==='shy'){gaze[1]=.45*active;head.roll=.014*active;}
 if(action==='sad'||action==='worried'){gaze[1]=.35*active;}
 if(action==='intro')strength*=.6;
 if(action==='angry'){head.pitch=-.018*active;gaze[0]=0;gaze[1]=-.15*active;}
 if(action==='compliment')head.pitch=.035*Math.sin(elapsed/350)*active;
 if(action==='joySway')head.roll=.018*Math.sin(elapsed/1000*2.2)*active;
 if(action==='beam')strength=Math.min(1,active*1.12);
 if(['explain','talkContinuous','guide'].includes(action)){gaze[0]=-contribution('explain')*.75+contribution('guide')*1.6-contribution('pointer')*1.6;}
 const stage=duration===0?'Au repos':elapsed<650?'Préparation':elapsed>duration-650?'Retour au repos':'Geste et expression';
 return {description:def.description,stage,active,head,gaze,expression,strength:clamp(strength)};
}
