// Reserved card slots use the map's SVG coordinates, so spacing survives resize/fullscreen/zoom.
export const CARD_WIDTH=132;
export const CARD_HEIGHT=50;
export const LABEL_POSITIONS=[
 [725,249],[894,314],[893,250],[449,70],[455,230],[283,432],
 [680,305],[290,262],[575,365],[263,147],[891,463],[440,499],[95,420]
];
export function cardRect([x,y]){return {x:x-CARD_WIDTH/2,y:y-CARD_HEIGHT/2,width:CARD_WIDTH,height:CARD_HEIGHT};}
export function overlaps(a,b,gap=0){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
export function nearestPoint(point,route){let best=null;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1))),p=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(p[0]-point[0],p[1]-point[1]);if(!best||distance<best.distance)best={point:p,distance};}return best?.point||point;}
export function connector(center,route){const p=nearestPoint(center,route),dx=p[0]-center[0],dy=p[1]-center[1];
 // An intersecting route already identifies its card; detached cards get a short leader.
 if(Math.abs(dx)<=CARD_WIDTH/2&&Math.abs(dy)<=CARD_HEIGHT/2)return null;
 const scale=Math.min(dx?CARD_WIDTH/2/Math.abs(dx):Infinity,dy?CARD_HEIGHT/2/Math.abs(dy):Infinity);
 return [[center[0]+dx*scale,center[1]+dy*scale],p];
}
