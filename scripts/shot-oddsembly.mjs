import {launch} from './lib/browser.mjs';
for(const [w,h,dpr,name,clip] of [[1472,1008,1,'final-1472'],[730,548,1,'final-730'],[1472,1008,2,'connection-2x',{x:140,y:230,width:335,height:540,scale:1}]]){
 const b=await launch({root:process.cwd()+'/dist',httpPort:4682,debugPort:4782});
 try{await b.setViewport(w,h,dpr);await b.goto('?mode=loom&static=1&ui=0');await b.evaluate(`window.__engine.inject({id:1,type:'Search',detail:'visual acceptance',at:0});for(let i=0;i<40;i++)window.__engine.tick(1/60)`);await b.screenshot(`review/oddsembly-final/${name}.png`,clip?{clip}:{});}finally{await b.close()}
}
