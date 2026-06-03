import * as logger from "firebase-functions/logger";
import {VertexRecommenderResponse} from "./types";

const B4A_APP_ID = process.env.B4A_APP_ID!;
const B4A_REST_API_KEY = process.env.B4A_REST_API_KEY!;
const B4A_RECOMMENDATIONS_URL =
  "https://parseapi.back4app.com/classes/recommendations";

async function fetchRecommendationsRecord(userId: string): Promise<Array<{strain_id: string; percentage: number}> | null> {
  const where = JSON.stringify({FirebaseUserId: userId});
  const url = `${B4A_RECOMMENDATIONS_URL}?where=${encodeURIComponent(where)}&limit=1`;

  const res = await fetch(url, {
    headers: {
      "X-Parse-Application-Id": B4A_APP_ID,
      "X-Parse-REST-API-Key": B4A_REST_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B4A recommendations fetch failed for user ${userId} (${res.status}): ${text}`);
  }

  const data = await res.json();
  const record = data.results?.[0];
  return record?.StrainRecommendations?.length ? record.StrainRecommendations : null;
}

export async function getB4aRecommendations(
  userId: string,
  topK: number,
  minConfidence: number,
): Promise<VertexRecommenderResponse> {
  logger.info(`Fetching B4A recommendations for user: ${userId}`);

  let strainRecommendations = await fetchRecommendationsRecord(userId);

  if (!strainRecommendations) {
    logger.info(`No B4A recommendations found for user: ${userId}, falling back to user: default`);
    strainRecommendations = await fetchRecommendationsRecord("default");
  }

  if (!strainRecommendations) {
    logger.info("No B4A recommendations found for fallback user: default");
    return {predictions: []};
  }

  const predictions = (strainRecommendations as Array<{strain_id: string; percentage: number}>)
    .filter((p) => p.percentage >= minConfidence)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, topK);

  logger.info(`Returning ${predictions.length} B4A recommendations for user: ${userId}`);

  return {predictions};
}
