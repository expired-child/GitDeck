import type { GraphEdge } from './GraphEdge';

export interface CommitGraphNode {
    hash: string;
    parents: string[];
    row: number;
    column: number;
    colorIndex: number;
    incomingEdges: GraphEdge[];
    outgoingEdges: GraphEdge[];
}
