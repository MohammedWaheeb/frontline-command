import {checkShadowComposition} from './shadow-composition';
import {OfflineTransport} from '../../src/runtime/offline';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {create} from '@bufbuild/protobuf';
import {EntitySchema} from '../../src/protocol/frontline_pb';

// One Pixi application per document, matching the product lifecycle. The
// isolated art check does not create a second renderer beside the live match.
const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog);
runtime.dispose();
const qa=await checkShadowComposition(catalog,create(EntitySchema,{id:1,owner:1,position:{x:0,y:0}}));
(window as unknown as {qa:typeof qa}).qa=qa;
document.body.dataset.ready='true';
