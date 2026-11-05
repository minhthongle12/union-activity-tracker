import{c as d,r as m,y as V,j as u,i as x,e as _}from"./index-BZX7YocL.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=d("CircleAlert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=d("CircleCheck",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=d("Clock",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 16 14",key:"68esgv"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=d("FileCheck",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"m9 15 2 2 4-4",key:"1grp1n"}]]);var $=Object.defineProperty,t=(e,r)=>$(e,"name",{value:r,configurable:!0}),y="Progress",f=100,[E,q]=V(y),[M,j]=E(y),P=m.forwardRef(t(function(r,n){const{__scopeProgress:i,value:o=null,max:a,getValueLabel:N=h,...C}=r;(a||a===0)&&!p(a)&&console.error(b(`${a}`,"Progress"));const s=p(a)?a:f;o!==null&&!v(o,s)&&console.error(k(`${o}`,"Progress"));const l=v(o,s)?o:null,I=c(l)?N(l,s):void 0;return u.jsx(M,{scope:i,value:l,max:s,children:u.jsx(x.div,{"aria-valuemax":s,"aria-valuemin":0,"aria-valuenow":c(l)?l:void 0,"aria-valuetext":I,role:"progressbar","data-state":g(l,s),"data-value":l??void 0,"data-max":s,...C,ref:n})})},"Progress")),w="ProgressIndicator",A=m.forwardRef(t(function(r,n){const{__scopeProgress:i,...o}=r,a=j(w,i);return u.jsx(x.div,{"data-state":g(a.value,a.max),"data-value":a.value??void 0,"data-max":a.max,...o,ref:n})},"ProgressIndicator"));function h(e,r){return`${Math.round(e/r*100)}%`}t(h,"defaultGetValueLabel");function g(e,r){return e==null?"indeterminate":e===r?"complete":"loading"}t(g,"getProgressState");function c(e){return typeof e=="number"}t(c,"isNumber");function p(e){return c(e)&&!isNaN(e)&&e>0}t(p,"isValidMaxNumber");function v(e,r){return c(e)&&!isNaN(e)&&e<=r&&e>=0}t(v,"isValidValueNumber");function b(e,r){return`Invalid prop \`max\` of value \`${e}\` supplied to \`${r}\`. Only numbers greater than 0 are valid max values. Defaulting to \`${f}\`.`}t(b,"getInvalidMaxError");function k(e,r){return`Invalid prop \`value\` of value \`${e}\` supplied to \`${r}\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${f} if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`}t(k,"getInvalidValueError");const R=m.forwardRef(({className:e,value:r,...n},i)=>u.jsx(P,{ref:i,className:_("relative h-4 w-full overflow-hidden rounded-full bg-secondary",e),...n,children:u.jsx(A,{className:"h-full w-full flex-1 bg-primary transition-all",style:{transform:`translateX(-${100-(r||0)}%)`}})}));R.displayName=P.displayName;export{S as C,O as F,R as P,F as a,D as b};
