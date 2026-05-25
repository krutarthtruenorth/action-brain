type GraphEntity = {
  entity_id: string;
  name: string;
  type: string;
};

type GraphRelationEvidence = {
  relationship_id: string;
  canonical_predicate: string;
  raw_predicate: string;
  context?: string;
};

export type GraphTriplet = {
  source: GraphEntity;
  target: GraphEntity;
  relations: GraphRelationEvidence[];
};

export type GraphNode = {
  id: string;
  label: string;
  type: string;
  val: number;
};

export type GraphLink = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export function tripletsToGraphData(
  triplets: (GraphTriplet | null | undefined)[],
  superNodeIds = new Set<string>(),
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const seenLinkIds = new Set<string>();

  for (const triplet of triplets) {
    if (!triplet?.source || !triplet.target) {
      continue;
    }

    for (const entity of [triplet.source, triplet.target]) {
      if (!nodes.has(entity.entity_id)) {
        nodes.set(entity.entity_id, {
          id: entity.entity_id,
          label: entity.name,
          type: entity.type,
          val: superNodeIds.has(entity.entity_id) ? 12 : 4,
        });
      }
    }

    for (const relation of triplet.relations ?? []) {
      if (seenLinkIds.has(relation.relationship_id)) {
        continue;
      }

      seenLinkIds.add(relation.relationship_id);
      links.push({
        id: relation.relationship_id,
        source: triplet.source.entity_id,
        target: triplet.target.entity_id,
        label: relation.raw_predicate || relation.canonical_predicate,
      });
    }
  }

  return { nodes: [...nodes.values()], links };
}
