/**
 * Cluster container node — invisible by design.
 *
 * In grouped mode, each parent infra (gateway / switch / AP / repeater) gets
 * a synthetic group node that acts as the positioning container for its
 * client children (React Flow uses parentId + extent='parent' for the
 * containment). The visible coloured frame from the earlier iteration was
 * misplacing itself and competing visually with the actual device cards, so
 * the container is now rendered as nothing — the cluster only serves as a
 * layout bounding box.
 */

import React from 'react';

export const TopologyGroupNode: React.FC<unknown> = () => null;

export default TopologyGroupNode;
