import 'fabric';

declare module 'fabric' {
  interface FabricObject {
    /** The sole editor-domain identifier persisted on Fabric projections. */
    layerId?: string;
  }
}
