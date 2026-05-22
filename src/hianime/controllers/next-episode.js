export const hianimeNextEpisodeController = (c) => {
  return c.json(
    {
      success: false,
      error: 'next-episode endpoint is not implemented for hianime',
    },
    501
  );
};
