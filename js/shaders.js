// Original shaders for 墨川 · 数字长卷. Simplex noise: Ashima Arts / Stefan Gustavson (MIT).
export const NOISE = /* glsl */`
vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);}vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=m289(i);
vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 nm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float h11(float p){return fract(sin(p*127.1)*43758.5453);}
float vn1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(h11(i),h11(i+1.),f);}
float fbm1(float x){float s=0.,a=.5;for(int k=0;k<5;k++){s+=a*vn1(x);x*=2.03;a*=.5;}return s;}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}`;

// ---------- sky: paper, warm gradient, vermilion sun (screen-space, drawn first) ----------
export const skyVert = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.9999,1.);}`;
export const skyFrag = NOISE + /* glsl */`
uniform float uT,uAspect,uSun,uScroll;uniform vec3 uPaper,uPaper2,uSunC;varying vec2 vUv;
void main(){vec2 uv=vUv;vec3 col=mix(uPaper,uPaper2,smoothstep(.15,1.,uv.y));
  vec2 sp=vec2(.84-uScroll*.5,.79-uScroll*.08);float d=length((uv-sp)*vec2(uAspect,1.))/max(.5,min(1.,uAspect/1.1));
  float sun=0.;if(d<.09)sun=smoothstep(.085,.08,d)*(.85+.15*snoise(vec3(uv*14.,1.)));
  col=mix(col,uSunC,sun*uSun);col=mix(col,uSunC,smoothstep(.35,.0,d)*.06*uSun);
  gl_FragColor=vec4(col,1.);}`;

// ---------- ink-wash mountain layer ----------
export const mtnVert = /* glsl */`varying vec2 vUv;varying float vDist;varying vec3 vW;
void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mv=viewMatrix*w;vDist=-mv.z;gl_Position=projectionMatrix*mv;}`;
export const mtnFrag = NOISE + /* glsl */`
uniform float uSeed,uPeak,uPeakX,uInk,uNear,uFar,uSnow,uH,uFreq,uW,uPine,uPineS;uniform vec3 uPaper,uInkC,uTint;varying vec2 vUv;varying float vDist;varying vec3 vW;
void main(){
  float x=vUv.x*uFreq+uSeed*17.;
  float ridge=fbm1(x)*.55+fbm1(x*2.9+3.)*.16+fbm1(x*9.+7.)*.035;
  float pk=exp(-pow((vUv.x-uPeakX)*2.6,2.))*uPeak;
  float edge=smoothstep(0.,.24,vUv.x)*smoothstep(1.,.76,vUv.x);
  float h=(.1+ridge*.5+pk*.5)*mix(.18,1.,edge);
  float y=vUv.y;
  float aa=max(fwidth(y)*1.2,.0008);
  float inside=smoothstep(h+aa,h-aa,y);
  // 松: ink pines standing on the ridge (only baked, so cost is irrelevant at runtime)
  float tree=0.;
  if(uPine>0.){
    float cw=.5*uPineS,wx=vUv.x*uW;
    for(int j=-1;j<=1;j++){
      float cell=floor(wx/cw)+float(j);if(h21(vec2(cell,uSeed+1.))>uPine)continue;
      float cx=(cell+.5)*cw+(h21(vec2(cell,uSeed))-.5)*cw*.5,ux=cx/uW;
      float xr=ux*uFreq+uSeed*17.;float rr=fbm1(xr)*.55+fbm1(xr*2.9+3.)*.16+fbm1(xr*9.+7.)*.035;
      float hb=(.1+rr*.5+exp(-pow((ux-uPeakX)*2.6,2.))*uPeak*.5)*mix(.18,1.,smoothstep(0.,.24,ux)*smoothstep(1.,.76,ux))*uH;
      if(hb<uH*.24||hb<1.55)continue;
      float th=(.5+.6*h21(vec2(cell,uSeed+2.)))*uPineS,lean=(h21(vec2(cell,uSeed+3.))-.5)*.25;
      float lx=wx-cx,ly=y*uH-hb+.06*uPineS;lx-=ly*lean;
      float tw=.018*uPineS*(1.-ly/th*.6);
      float tr=smoothstep(tw,tw*.4,abs(lx+sin(ly*9.)*.012*uPineS))*step(0.,ly)*step(ly,th*.92);
      float cl=0.;
      for(int k=0;k<4;k++){float fk=float(k);float fy=th*(.38+.19*fk);float wd=(.26-.05*fk)*uPineS*(.75+.5*h21(vec2(cell,fk+9.)));
        float sx=(h21(vec2(cell,fk+5.))-.5)*.14*uPineS;vec2 d=vec2((lx-sx)/wd,(ly-fy)/(.065*uPineS));
        float e=length(d)+snoise(vec3(lx*26./uPineS,ly*40./uPineS,fk+cell))*.22;
        float under=step(ly,fy+.01*uPineS); // flat-topped needle clumps
        cl=max(cl,smoothstep(1.,.8,e)*mix(.75,1.,under));}
      tree=max(tree,max(tr,cl));
    }
  }
  if(inside<.002&&tree<.01)discard;
  float dW=(h-y)*uH;                                    // world-units below the ridge
  float far=smoothstep(uNear,uFar,vDist);
  float wash=exp(-dW*1.15)*.78+.2*exp(-dW*.35);
  float n1=snoise(vec3(vW.x*1.3,vW.y*.32,uSeed));
  float n2=snoise(vec3(vW.x*3.1,vW.y*.9,uSeed+3.));
  float tex=mix(.72,1.18,n1*.5+.5)*mix(.86,1.08,n2*.5+.5);
  // 皴: fold lines following the slope
  float n3=snoise(vec3(vW.x*.8+vW.y*.35,vW.y*.25,uSeed+9.));
  float cun=smoothstep(.07,.0,abs(n3))*exp(-dW*.5)*.42;
  // 点苔: moss dots hugging the ridge
  vec2 g=vec2(vUv.x*uFreq*60.,y*uH*9.);vec2 gi=floor(g);
  float dots=step(.9,h21(gi+uSeed))*step(length(fract(g)-.5),.32)*smoothstep(.55,.0,dW)*smoothstep(0.,.05,dW);
  float ink=clamp(wash*tex+cun+dots*.55,0.,1.);
  ink=max(ink,smoothstep(.07,.0,dW)*(.75+.25*n1));     // dry-brush contour
  float snow=smoothstep(.02,.25,dW)*smoothstep(1.1,.3,dW)*uSnow*smoothstep(.1,.5,n2);
  ink*=1.-snow*.8;
  ink*=uInk*mix(1.,.4,far);
  vec3 inkC=mix(uInkC,uTint,far*.9);
  ink=mix(tree*uInk*mix(1.,.5,far),max(ink,tree*uInk),inside);
  inside=max(inside,tree);
  float foot=min(1.,smoothstep(.0,.35,y/max(h,.001)))*smoothstep(-.45,1.1+far*2.5,vW.y);   // mist swallowing the foot at the waterline
  float a=inside*foot*smoothstep(1.2,5.,vDist);
  gl_FragColor=vec4(mix(uPaper,inkC,ink),a);}`;

// ---------- water: sparse ink ripple strokes ----------
export const waterFrag = NOISE + /* glsl */`
uniform float uT,uFlow;uniform vec3 uPaper,uInkC;varying vec2 vUv;varying float vDist;varying vec3 vW;
void main(){vec2 p=vW.xz;
  float fade=smoothstep(42.,6.,vDist)*smoothstep(1.,4.,vDist);if(fade<.01)discard;
  float lane=p.y*5.2+snoise(vec3(p.x*.12,p.y*.4,0.))*1.4;
  float row=fract(lane);float id=floor(lane);
  float dash=snoise(vec3(p.x*.35+uT*uFlow*(.6+h21(vec2(id,1.))*.6)+id*7.,id,1.));
  float stroke=smoothstep(.12,.0,abs(row-.5)-.02)*smoothstep(.25,.55,dash);
  gl_FragColor=vec4(uInkC,stroke*fade*.32);}`;

// ---------- baking: render a layer's procedural ink once into a texture ----------
export const bakeVert = /* glsl */`uniform vec3 uOrigin;uniform vec2 uSize;uniform float uDist;varying vec2 vUv;varying float vDist;varying vec3 vW;
void main(){vUv=uv;vW=uOrigin+vec3(uv.x*uSize.x,uv.y*uSize.y,0.);vDist=uDist;gl_Position=vec4(uv*2.-1.,0.,1.);}`;
// runtime: just a texture fetch (+ near fade). Cheap enough for 100+ overlapping layers.
export const inkTexFrag = /* glsl */`uniform sampler2D map;uniform float uFlip,uFade;varying vec2 vUv;varying float vDist;
void main(){vec4 c=texture2D(map,vec2(mix(vUv.x,1.-vUv.x,uFlip),vUv.y));float a=c.a*smoothstep(1.2,5.,vDist)*uFade;if(a<.004)discard;gl_FragColor=vec4(c.rgb,a);}`;
// tileable mist (noise sampled on a cylinder so it wraps in x)
export const mistBakeFrag = NOISE + /* glsl */`varying vec2 vUv;
void main(){float a=vUv.x*6.28318;vec3 p=vec3(cos(a)*1.3,sin(a)*1.3,vUv.y*1.7);
  float n=snoise(p)*.6+snoise(p*2.3+4.)*.3+snoise(p*5.1+9.)*.1;
  gl_FragColor=vec4(1.,1.,1.,clamp(n*.5+.5,0.,1.));}`;
export const mistTexFrag = /* glsl */`uniform sampler2D map;uniform float uT,uSeed,uA;uniform vec3 uPaper;varying vec2 vUv;varying float vDist;
void main(){float n=texture2D(map,vec2(vUv.x*1.6+uT*.004+uSeed,vUv.y)).a;float n2=texture2D(map,vec2(vUv.x*2.7-uT*.006+uSeed*1.7,vUv.y*.8+.1)).a;
  float band=smoothstep(.0,.35,vUv.y)*smoothstep(1.,.45,vUv.y);float edge=smoothstep(0.,.18,vUv.x)*smoothstep(1.,.82,vUv.x);
  float a=clamp((n*.65+n2*.35)*1.25-.2,0.,1.)*band*edge*uA*smoothstep(1.,6.,vDist);if(a<.004)discard;gl_FragColor=vec4(uPaper,a);}`;

// ---------- drifting mist (unused fallback) ----------
export const mistFrag = NOISE + /* glsl */`
uniform float uT,uSeed,uA;uniform vec3 uPaper;varying vec2 vUv;varying float vDist;varying vec3 vW;
void main(){vec2 p=vec2(vUv.x*4.+uT*.02+uSeed,vUv.y*1.6);
  float n=snoise(vec3(p,uSeed))*.6+snoise(vec3(p*2.3,uSeed+uT*.03))*.3;
  float band=smoothstep(.0,.35,vUv.y)*smoothstep(1.,.45,vUv.y);
  float edge=smoothstep(0.,.18,vUv.x)*smoothstep(1.,.82,vUv.x);
  float a=clamp(n*.5+.45,0.,1.)*band*edge*uA*smoothstep(1.,6.,vDist);
  gl_FragColor=vec4(uPaper,a);}`;

// ---------- cranes (instanced, procedural wing beat) ----------
export const craneVert = /* glsl */`
uniform float uT;attribute float aPhase;attribute float aWing;attribute float aSpan;varying float vSpan;varying float vWing;varying float vFog;
void main(){vec3 p=position;
  float f=sin(uT*(3.2+aPhase*.8)+aPhase*20.);
  float ang=(f*.75+.15)*aSpan;
  if(abs(aWing)>.5&&abs(aWing)<1.5){float s=aWing;float r=abs(p.x);p.y+=sin(ang)*r;p.x=s*cos(ang)*r;}
  p.y+=-f*.04;
  vSpan=aSpan;vWing=aWing;
  vec4 mv=viewMatrix*modelMatrix*instanceMatrix*vec4(p,1.);vFog=smoothstep(10.,60.,-mv.z);
  gl_Position=projectionMatrix*mv;}`;
export const craneFrag = /* glsl */`
uniform vec3 uInkC,uPaper,uSeal,uWhite;varying float vSpan;varying float vWing;varying float vFog;
void main(){vec3 c=uWhite;
  if(vWing>2.5)c=uInkC; else if(vWing>1.5)c=uSeal; else if(abs(vWing)>.5)c=mix(uWhite,uInkC,smoothstep(.66,.82,vSpan));
  gl_FragColor=vec4(mix(c,uPaper,vFog*.8),1.);}`;

// ---------- bronze vessel (stylised PBR-ish) ----------
export const bronzeVert = /* glsl */`varying vec3 vN,vV,vP;varying vec2 vUv;
void main(){vUv=uv;vP=position;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`;
export const bronzeFrag = NOISE + /* glsl */`
uniform float uT,uBand;uniform vec3 uLight;varying vec3 vN,vV,vP;varying vec2 vUv;
void main(){vec3 N=normalize(vN),V=normalize(vV);
  // engraved meander band (雷纹-like) on the body
  float band=uBand*smoothstep(-.06,-.02,vP.y)*smoothstep(.3,.26,vP.y);
  vec2 q=vec2((atan(vP.z,vP.x)/6.2832+.5)*28.,vP.y*9.);vec2 c=fract(q)-.5;float m=max(abs(c.x),abs(c.y));
  float spiral=step(.5,fract((m+atan(c.y,c.x)/6.283*.25)*4.));
  float engr=band*spiral;
  N=normalize(N+engr*.18*vec3(c,0.));
  float pat=snoise(vP*6.)*.5+.5,pat2=snoise(vP*18.+3.)*.5+.5;
  float patina=smoothstep(.55,.85,pat*.75+pat2*.25+engr*.15);
  vec3 bronze=vec3(.52,.38,.2),verd=vec3(.29,.52,.45),dark=vec3(.12,.09,.06);
  vec3 base=mix(bronze,verd,patina*.85);base=mix(base,dark,engr*.45);
  float ndl=max(dot(N,normalize(uLight)),0.);
  vec3 R=reflect(-V,N);float env=smoothstep(-.2,.9,R.y);
  float spec=pow(max(dot(R,normalize(uLight)),0.),40.)*(1.-patina);
  float fr=pow(1.-max(dot(N,V),0.),3.);
  vec3 col=base*(.22+.75*ndl)+mix(vec3(.05),vec3(.95,.8,.55),env)*(1.-patina)*.35+spec*vec3(1.,.9,.7)*.9+fr*vec3(.9,.75,.5)*.35;
  gl_FragColor=vec4(min(col,vec3(1.)),0.);}`;

// ---------- ink motes around the vessel ----------
export const moteVert = /* glsl */`uniform float uT,uPR;attribute float aR;varying float vA;
void main(){float a=aR*80.+uT*(.15+aR*.25);float r=1.6+aR*1.8;vec3 p=vec3(cos(a)*r,(fract(aR*13.+uT*.03)-.5)*3.,sin(a)*r);
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=uPR*(1.5+aR*3.)*(8./-mv.z);vA=.5+.5*aR;}`;
export const moteFrag = /* glsl */`uniform vec3 uC;varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(uC,vA*(1.-d*2.));}`;

// ---------- final pass: ink-bleed chapter transitions (rubbing / 拓片 negative), paper grain, vignette ----------
export const finalShader = {
  uniforms: { tDiffuse: { value: null }, tGrain: { value: null }, uT: { value: 0 }, uIn: { value: 0 }, uOut: { value: 0 }, uAspect: { value: 1 }, uGrain: { value: 1 }, uInkC: { value: null }, uPaper: { value: null }, uRes: { value: null } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: NOISE + `uniform sampler2D tDiffuse,tGrain;uniform vec2 uRes;uniform float uT,uIn,uOut,uAspect,uGrain;uniform vec3 uInkC,uPaper;varying vec2 vUv;
  float msk(float front,float k){return smoothstep(k+.015,k-.035,front);}
  void main(){vec4 s=texture2D(tDiffuse,vUv);vec3 col=s.rgb;float protect=1.-s.a;
    float l=dot(col,vec3(.299,.587,.114));
    vec3 stone=vec3(.84,.81,.74);
    vec3 neg=mix(uInkC*.82,stone,clamp((1.-l)*1.35-.08,0.,1.));
    vec2 q=vUv*vec2(uAspect,1.);
    // ink sheet anchored to the chapter's top (uIn) and bottom (uOut) edges in screen space
    float m=step(uOut,vUv.y)*step(vUv.y,uIn),halo=0.,rim=0.;
    bool nearEdge=abs(vUv.y-uIn)<.2||abs(vUv.y-uOut)<.2;
    if(nearEdge){
      float n=snoise(vec3(q*1.6,uT*.05))*.055+snoise(vec3(q*5.,uT*.03+2.))*.022+(texture2D(tGrain,vUv*uRes/256.).g-.5)*.018;
      float dt=uIn-(vUv.y+n), db=(vUv.y-n)-uOut;          // signed distance inside each edge
      m=smoothstep(-.004,.006,dt)*smoothstep(-.004,.006,db);
      // capillary bleed: soft grey diffusion just outside the edge, darker fringe just inside
      float fing=snoise(vec3(q.x*38.,q.y*6.,1.))*.5+.5;
      halo=smoothstep(.07*(.4+fing),0.,-dt)*step(dt,0.)+smoothstep(.07*(.4+fing),0.,-db)*step(db,0.);
      rim=(smoothstep(.03,0.,dt)*step(0.,dt)+smoothstep(.03,0.,db)*step(0.,db))*m;
    }
    col=mix(col,mix(neg,col,protect),m);
    col=mix(col,uInkC,clamp(rim,0.,1.)*.45*(1.-protect));
    col=mix(col,mix(col,uInkC,.35),clamp(halo,0.,1.)*(1.-m));
    float g=texture2D(tGrain,vUv*uRes/256.).r*2.-1.;
    col*=1.+g*.02*uGrain;
    vec2 c=vUv-.5;col*=1.-.2*dot(c*vec2(1.05,1.35),c*vec2(1.05,1.35));
    gl_FragColor=vec4(col,1.);}`
};

// ---------- periodic (tileable) gradient noise, used to bake a shared RGBA noise tile ----------
export const PNOISE = /* glsl */`
vec2 pgrad(vec2 i,float P){i=mod(i,P);float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453)*6.2831853;return vec2(cos(a),sin(a));}
float pnoise(vec2 x,float P){vec2 i=floor(x),f=fract(x);vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(pgrad(i,P),f),b=dot(pgrad(i+vec2(1.,0.),P),f-vec2(1.,0.)),c=dot(pgrad(i+vec2(0.,1.),P),f-vec2(0.,1.)),d=dot(pgrad(i+1.,P),f-1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float pfbm(vec2 x,float P){float s=0.,a=.5;for(int k=0;k<6;k++){s+=a*pnoise(x,P);x*=2.;P*=2.;a*=.5;}return s;}`;
export const noiseTileFrag = PNOISE + /* glsl */`varying vec2 vUv;
void main(){vec2 x=vUv*8.;
  float r=pfbm(x,8.)*.5+.5, g=pfbm(x+vec2(3.,7.),8.)*.5+.5, b=1.-abs(pfbm(x*.5+vec2(11.,5.),4.))*1.6, a=pfbm(x*2.+vec2(5.,1.),16.)*.5+.5;
  gl_FragColor=vec4(r,g,clamp(b,0.,1.),a);}`;
export const FS_VERT = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const FS_BACK = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.9999,1.);}`;
