export const PROMPT='帮我生成一个表格，表格内容为7659699571975652389 甜屿声 这个直播间的所有连线嘉宾，在本月每一天的流水和连线时长，只有这一个sheet页，第一列为日期，第二列为嘉宾昵称（表格中改为拍档名），第三列为当日音浪，第四列为当日连线时长，第五列为入会时间。入会时间为“非本公会”的嘉宾不纳入表格和任何统计。';
const totals=[100,300,800,1500,2200,3000,5000,7000,9000,11000,13000,16000,19000,22500,26000,30000,35000,40000,46500,53000,60000,75000,100000,125000,200000];
export const TIERS=totals.map((total,i)=>({id:'tier-'+i,name:['青铜','白银','黄金','钻石','星耀'][Math.floor(i/5)]+(i%5+1),total}));
export const RULES=[
 {id:'weekly-1',kind:'weekly',label:'周流水阶梯',target:30000,reward:'价值不低于30元的礼物',enabled:true},
 {id:'weekly-2',kind:'weekly',label:'周流水阶梯',target:50000,reward:'价值不低于66元的礼物',enabled:true},
 {id:'weekly-3',kind:'weekly',label:'周流水阶梯',target:100000,reward:'价值不低于188元的礼物',enabled:true},
 {id:'new-1',kind:'new-1',label:'新人首周',target:10000,reward:'价值不低于30元的礼物',enabled:true},
 {id:'new-2',kind:'new-2',label:'新人第二周',target:20000,reward:'价值不低于30元的礼物',enabled:true},
 {id:'new-3',kind:'new-3',label:'新人第三周',target:30000,reward:'价值66元的礼物',enabled:true},
 {id:'new-month',kind:'new-month',label:'新人前30天',target:60000,reward:'价值不低于188元的礼物',enabled:true}];
export function emptyState(){return {profiles:[],records:[],tiers:structuredClone(TIERS),rules:structuredClone(RULES),tasks:[],ratio:10,prompt:PROMPT};}
