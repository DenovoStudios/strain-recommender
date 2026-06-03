import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getB4aRecommendations} from "./b4aRecommender";
import {enrichWithBack4AppData} from "./strainEnricher";
import {groupRecommendationsByAttribute}
  from "./groupRecommendationsByAttribute";
import {RecommendationResponse} from "./types";
import {fetchStrainOfTheDay} from "./strainOfTheDayFetcher";

const TOP_K_PREDICTIONS_DEFAULT = 900;
const MAX_GROUPS_DEFAULT = 20;
const MIN_STRAINS_PER_GROUP_DEFAULT = 4;
const MAX_STRAINS_PER_GROUP_DEFAULT = 4;
const MIN_CONFIDENCE_DEFAULT = 0;

export const strainRecommender = onRequest(async (req, res) => {
  try {
    const userId = req.query.user_id as string;
    const topK = req.query.top_k ?
      Number(req.query.top_k) : TOP_K_PREDICTIONS_DEFAULT;

    const maxStrainsPerGroup = req.query.max_per_group ?
      Number(req.query.max_per_group) :
      MAX_STRAINS_PER_GROUP_DEFAULT;

    const minStrainsPerGroup = req.query.min_per_group ?
      Number(req.query.min_per_group) :
      MIN_STRAINS_PER_GROUP_DEFAULT;

    const maxGroups = req.query.max_groups ?
      Number(req.query.max_groups) :
      MAX_GROUPS_DEFAULT;

    const minConfidence = req.query.min_confidence ?
      Number(req.query.min_confidence) :
      MIN_CONFIDENCE_DEFAULT;

    if (!userId) {
      res.status(400).json({error: "Missing user_id parameter"});
      return;
    }

    // Vertex predictions
    const vertexResponse = await getB4aRecommendations(userId, topK, minConfidence);

    // Back4App enrichment
    const enrichedStrains = await enrichWithBack4AppData(vertexResponse);

    // Build grouped recommendations (lightweight strain refs)
    const grouped = groupRecommendationsByAttribute(enrichedStrains,
      maxGroups,
      minStrainsPerGroup,
      maxStrainsPerGroup);

    // Response
    const response: RecommendationResponse = {
      user_id: userId,
      strainOfTheDay: fetchStrainOfTheDay(enrichedStrains),
      recommendations: grouped,
    };

    res.status(200).json(response);
  } catch (error: any) {
    logger.error("strain_recommender error:", error);
    res.status(500).json({error: error.message});
  }
});
