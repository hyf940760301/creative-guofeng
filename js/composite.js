// Scene compositor: blends the outgoing (A) and incoming (B) scene renders with one of several
// scroll-scrubbed transitions, plus click-drops of ink, paper grain and vignette. All transitions are
// pure functions of progress p ∈ [0,1], so scrubbing forward/backward is continuous and interruptible.
import { NOISE } from './shaders.js';
export const TRANS = { none: 0, drop: 1, fog: 2, dive: 3, brush: 4, unroll: 5, tear: 6, stamp: 7 };
export const compositeShader = {
  uniforms: { tA: { value: null }, tB: { value: null }, tN: { value: null }, tGrain: { value: null }, uP: { value: 0 }, uType: { value: 0 }, uAsp: { value: 1 }, uT: { value: 0 },
    uRes: { value: null }, uC: { value: null }, uHS: { value: null }, uInk: { value: null }, uPaper: { value: null }, uDrops: { value: null }, uDropCol: { value: null }, uGrainA: { value: 1 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader: NOISE + /* glsl */`
uniform sampler2D tA,tB,tN,tGrain;uniform float uP,uType,uAsp,uT,uGrainA;uniform vec2 uRes,uC,uHS;uniform vec3 uInk,uPaper,uDropCol;uniform vec4 uDrops[6];varying vec2 vUv;
float N(vec2 p){return texture2D(tN,p).r;}
vec3 A(vec2 uv){return texture2D(tA,clamp(uv,0.,1.)).rgb;}
vec3 B(vec2 uv){return texture2D(tB,clamp(uv,0.,1.)).rgb;}
void main(){vec2 uv=vUv;vec2 q=(uv-.5)*vec2(uAsp,1.);float p=uP;vec3 col;
  int ty=int(uType+.5);
  if(ty==0){col=mix(A(uv),B(uv),smoothstep(0.,1.,p));}
  else if(ty==1){ // DROP — an ink drop lands and blooms outward; the new scene shows through the settled ink
    vec2 d=(uv-uC)*vec2(uAsp,1.);float r=length(d);float ang=atan(d.y,d.x);
    float wob=N(vec2(ang*.35,p*.2))*.22+N(vec2(ang*1.4,.5))*.08;
    float R=pow(p,1.35)*1.9;float edge=R*(1.+wob-.12)-r;
    float m=smoothstep(0.,.02,edge);float inner=smoothstep(.0,.25+R*.2,edge);
    vec3 ink=mix(uInk,uInk*.6+.05,N(d*2.+.3));
    col=mix(A(uv),ink,m);col=mix(col,B(uv),inner*smoothstep(.15,.6,p));
    float halo=smoothstep(.07,0.,-edge)*step(edge,0.)*(1.-p);col=mix(col,col*.72,halo);
    col=mix(col,B(uv),smoothstep(.85,1.,p));                       // lands exactly on B at p=1 (no pop)
  } else if(ty==2){ // FOG — the old scene dissolves into drifting mist, the new one condenses out of it
    float n=N(uv*vec2(uAsp,1.)*.35+vec2(uT*.01,0.))*.7+N(uv*1.3-vec2(uT*.006,0.))*.3;
    float a=smoothstep(.0,.55,p),b=smoothstep(.45,1.,p);
    vec3 fogc=vec3(.97,.94,.9);
    float mA=smoothstep(a-.1,a+.1,n+.05),mB=smoothstep(b+.1,b-.1,n-.05);
    col=mix(fogc,A(uv),mA*(1.-a*.4));col=mix(col,B(uv),mB);
    col=mix(col,fogc*(.93+.1*n),sin(p*3.14159)*.24*(1.-mB));            // textured mist at the peak, never a flat card
    col=mix(col,mix(A(uv),B(uv),smoothstep(.35,.65,p)),.3*(1.-mB));      // silhouettes stay faintly visible through the mist
  } else if(ty==3){ // DIVE — lens rushes into a bright disc (sun / moon), radial streaks, emerge in the new scene
    vec2 c=uC;float z=1.+pow(p,2.2)*9.;vec2 ua=c+(uv-c)/z;
    vec3 a=vec3(0.);for(int i=0;i<5;i++){float f=1.-float(i)*.018*p;a+=A(c+(ua-c)*f);}a/=5.;
    float zb=mix(.55,1.,smoothstep(.45,1.,p));vec2 ub=c+(uv-c)*zb;vec3 b=B(ub);
    float r=length((uv-c)*vec2(uAsp,1.));float open=smoothstep(.45,1.,p)*1.6;
    float m=smoothstep(open,open-.25,r);vec3 flash=vec3(1.,.95,.86);
    col=mix(a,flash,smoothstep(.3,.55,p)*(1.-smoothstep(.55,.85,p)));col=mix(col,b,m*smoothstep(.45,.6,p));
  } else if(ty==4){ // 飞白 BRUSH — one loaded brush sweeps along a curved path; bristle streaks, dry-brush gaps,
    // tapered tip (出锋), ink falloff toward the tail and edges; the stroke broadens until it has painted the new scene.
    float xs=uv.x;
    float yc=.52+.11*sin(xs*3.1-.9)+(.5-xs)*.16;                       // curved, gently rising path
    float W=mix(.17,1.3,smoothstep(.3,.97,p));                          // half width: a stroke first, then a broad wash
    float head=mix(-.3,1.45,smoothstep(.0,.62,p));                      // tip position along the path
    float t=(uv.y-yc)/W;float at=abs(t);
    float tip=head-.26*at*at-.035*vn1(t*11.+3.);                         // tapered, slightly ragged tip
    float along=smoothstep(tip,tip-.035,xs);
    float side=smoothstep(1.,.84,at+.05*vn1(xs*9.+t));                   // soft bristle edge of the stroke
    // bristles: fine streaks running along the stroke, broken by slow along-stroke variation
    float br=vn1(t*58.+7.)*.5+vn1(t*165.+2.)*.28+N(vec2(xs*.45+t*.03,t*.7+.2))*.42;
    // ink load: dries toward the tail of the pass, toward the edges, and just behind the tip; refills as p grows
    float behind=tip-xs;
    float dry=.2+.5*smoothstep(.35,1.4,xs+.3)+.6*at*at*at+.18*smoothstep(.14,.0,behind);
    dry-=smoothstep(.5,.95,p)*1.25;
    float cov=smoothstep(dry-.07,dry+.07,br)*along*side;
    vec3 a=A(uv),b=B(uv);
    float paper=N(uv*vec2(uAsp,1.)*3.1+.4)*.6+N(uv*vec2(uAsp,1.)*11.)*.4;     // paper fibre showing in the gaps
    float gap=along*side*(1.-cov)*(1.-smoothstep(.55,.9,p));
    vec3 paperC=mix(uPaper*.92,uPaper,paper);
    vec3 under=mix(a,mix(a,paperC,.35+.25*paper),smoothstep(.0,.25,gap)*.55*smoothstep(.02,.2,behind));
    float wetEdge=cov*(1.-cov)*4.;                                      // ink pools at bristle edges
    float headInk=smoothstep(.1,.0,behind)*along*side;                  // wet, darker ink right at the tip
    vec3 painted=mix(b,b*vec3(.80,.78,.75),max(wetEdge*.35,headInk*.45)*(1.-smoothstep(.6,.95,p)));
    col=mix(under,painted,cov);
    col=mix(col,B(uv),smoothstep(.9,1.,p));
  } else if(ty==5){ // UNROLL — a handscroll unrolls right-to-left over the old scene, roller shading at the edge
    float xf=1.-p*1.12+.06;float w=.035;
    float dx=uv.x-xf;
    if(dx>w){col=B(uv);}
    else if(dx>-w){float a=asin(clamp(dx/w,-1.,1.));float shade=.55+.45*cos(a);vec2 ur=vec2(xf+a/1.5708*w*1.6,uv.y);col=mix(vec3(.55,.4,.25),B(ur),.35)*shade+pow(max(cos(a+.6),0.),12.)*.25;}
    else{col=A(uv);float sh=smoothstep(.0,.08,-dx-w);col*=mix(1.,.7+.3*sh,smoothstep(0.,.06,p));}  // roller shadow fades in from p=0
  } else if(ty==6){ // TEAR — paper tears down a jagged line, the halves pull apart over the new scene
    float j=N(vec2(uv.y*1.4,.2))*.18+N(vec2(uv.y*7.,.6))*.05+N(vec2(uv.y*30.,.9))*.012-.12;
    float xt=.5+j;float open=easeTear(p);float fe=smoothstep(0.,.03,open)*(1.-smoothstep(.9,1.,p));
    float L=xt-open*.68,Rr=xt+open*.68;
    if(uv.x<L){col=A(uv+vec2(open*.68,0.));float fib=smoothstep(.012,0.,L-uv.x)*step(.5,N(vec2(uv.y*60.,.3)));col=mix(col,vec3(.97,.95,.9),fib*.9*fe);}
    else if(uv.x>Rr){col=A(uv-vec2(open*.68,0.));float fib=smoothstep(.012,0.,uv.x-Rr)*step(.5,N(vec2(uv.y*60.,.8)));col=mix(col,vec3(.97,.95,.9),fib*.9*fe);}
    else{col=B(uv);float s=min(uv.x-L,Rr-uv.x);col*=mix(1.,.6+.4*smoothstep(0.,.06,s),fe);}
  } else { // STAMP — the seal's shadow descends onto the old scene, the impression transfers unevenly (revealing the new
    // scene's real impression, aligned by projection), then the new scene soaks outward from it like ink into paper.
    vec2 d=(uv-uC)*vec2(uAsp,1.);
    float bx=max(abs(d.x)/uHS.x,abs(d.y)/uHS.y);
    float edgeN=N(d*4.+.3)*.05+N(d*13.)*.025;
    float inS=smoothstep(1.06,.98,bx+edgeN);
    float shadow=smoothstep(.0,.1,p)*(1.-smoothstep(.13,.22,p))*smoothstep(2.6,.8,bx)*.62;
    float thr=mix(1.05,.18,smoothstep(.1,.3,p));
    float tex=N(d*5.+1.)*.6+N(d*17.)*.4;
    float ink=smoothstep(thr-.12,thr,tex+.25)*smoothstep(.09,.13,p);
    col=A(uv)*(1.-shadow);
    col=mix(col,B(uv),ink*inS);
    float wob=N(vec2(atan(d.y,d.x)*.5,.3))*.14+N(d*3.)*.08;
    float front=smoothstep(.3,.88,p)*1.75-.05;
    float dd=max(0.,length(d/uHS)-1.15)*min(uHS.x,uHS.y);
    col=mix(col,B(uv),smoothstep(front,front-.12,dd+wob));
    col=mix(col,B(uv),smoothstep(.93,1.,p));
  }
  // click ink drops (screen space), any scene
  for(int i=0;i<6;i++){vec4 dp=uDrops[i];if(dp.w<=0.)continue;float age=uT-dp.z;if(age<0.||age>6.)continue;
    vec2 d=(uv-dp.xy)*vec2(uAsp,1.);float r=length(d);float ang=atan(d.y,d.x);
    float R=dp.w*(1.-exp(-age*2.6))*(1.+N(vec2(ang*.5,dp.z))*.35);
    float m=smoothstep(R,R-.008,r)*(1.-smoothstep(2.,6.,age));
    float sat=smoothstep(R*.4,R,r)*.35+.65;
    float spl=0.;for(int k=0;k<5;k++){float a=float(k)*1.37+dp.z;vec2 o=vec2(cos(a),sin(a))*dp.w*(1.2+float(k)*.15)*(1.-exp(-age*3.));spl+=smoothstep(.012,.006,length(d-o));}
    col=mix(col,uDropCol*sat,clamp(m+spl*(1.-smoothstep(2.,6.,age)),0.,1.)*.85);}
  float g=texture2D(tGrain,uv*uRes/256.).r*2.-1.;col*=1.+g*.02*uGrainA;
  vec2 v=uv-.5;col*=1.-.18*dot(v*vec2(1.05,1.35),v*vec2(1.05,1.35));
  gl_FragColor=vec4(col,1.);}`.replace('void main(){vec2 uv=vUv;', 'float easeTear(float p){return p<.5?4.*p*p*p:1.-pow(-2.*p+2.,3.)/2.;}\nvoid main(){vec2 uv=vUv;'),
};
