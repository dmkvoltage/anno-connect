export interface Rating {
  id: string;
  raterId: string;
  ratedUserId: string;
  rating: number; // 1-5 stars
  reason?: string;
  createdAt: Date;
}

export interface CreateRatingInput {
  ratedUserId: string;
  rating: number;
  reason?: string;
}

export interface UserRatingSummary {
  averageRating: number;
  totalRatings: number;
  recentRatings: Rating[];
}
