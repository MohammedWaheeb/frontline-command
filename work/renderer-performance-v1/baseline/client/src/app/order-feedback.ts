import type {OrderIntent,Point} from '../runtime';

/** Copy only a ground location that the local command explicitly supplied.
 * Entity targets never become a hidden-position lookup for rejected orders. */
export function orderFeedbackPoint(order:OrderIntent):Point|undefined {
 const point=order.position;
 if(typeof point?.x!=='number'||typeof point.y!=='number'||!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)||point.x<0||point.y<0)return;
 return {x:point.x,y:point.y};
}
