// Only load the viewer's like, alongside the total count.
export function likeInclude(viewerId: string) {
  return {
    _count: { select: { likes: true } },
    likes: { where: { userId: viewerId }, select: { id: true } },
  } as const;
}

export type LikeRow = {
  _count?: { likes: number };
  likes?: { id: string }[];
};

export function likeSummary(row: LikeRow) {
  return {
    likeCount: row._count?.likes ?? 0,
    likedByMe: (row.likes?.length ?? 0) > 0,
  };
}
