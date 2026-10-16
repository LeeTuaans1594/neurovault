"""
NEUROVAULT — Topic Clusterer (White-Box)
Clustering concepts based on their semantic context similarity.
Uses TF-IDF vectors and Agglomerative Clustering.
"""

import math
import logging
from typing import List, Dict, Set
from collections import Counter
import re

logger = logging.getLogger(__name__)

class TopicClusterer:
    """
    Topic-aware concept clusterer using semantic similarity.
    Groups concepts that appear in similar textual contexts,
    even if they don't have direct topological edges.
    """
    
    def __init__(self, stopwords: set = None):
        self.stopwords = stopwords or set()
        
    def cluster(
        self, 
        concepts: List[str], 
        chunk_concepts: Dict[str, List[str]], 
        chunks: List[Dict], 
        max_clusters: int = 8
    ) -> Dict[str, int]:
        """
        Cluster concepts based on their context TF-IDF similarity.
        Returns: Dict mapping concept_name -> cluster_id
        """
        if not concepts:
            return {}
            
        # 1. Build document (context) for each concept
        concept_texts = {c: [] for c in concepts}
        for chunk in chunks:
            chunk_id = chunk["chunk_id"]
            text = chunk["text"]
            c_in_chunk = set(chunk_concepts.get(chunk_id, []))
            for c in c_in_chunk:
                if c in concept_texts:
                    concept_texts[c].append(text)
                    
        # Join chunks into one context string per concept
        corpus = []
        valid_concepts = []
        for c in concepts:
            if concept_texts.get(c):
                corpus.append(" ".join(concept_texts[c]))
                valid_concepts.append(c)
                
        if not valid_concepts:
            return {c: 0 for c in concepts}
            
        # 2. Compute TF-IDF
        tf_idf_vectors = self._compute_tfidf(corpus)
        
        # 3. Compute cosine distance matrix
        n = len(valid_concepts)
        dist_matrix = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                sim = self._cosine_sim(tf_idf_vectors[i], tf_idf_vectors[j])
                dist = 1.0 - sim
                dist_matrix[i][j] = dist
                dist_matrix[j][i] = dist
                
        # 4. Agglomerative Clustering
        k = min(max_clusters, max(2, n // 4)) # Automatic k selection
        clusters = self._agglomerative_clustering(dist_matrix, k=k)
        
        # Map back to concept names
        result = {}
        for i, c in enumerate(valid_concepts):
            result[c] = clusters[i]
            
        # Assign concepts with no context to a default cluster
        for c in concepts:
            if c not in result:
                result[c] = 0
                
        logger.info(f"[TopicClusterer] Clustered {n} concepts into {len(set(clusters))} semantic topics")
        return result

    def _compute_tfidf(self, corpus: List[str]) -> List[Dict[str, float]]:
        """Compute TF-IDF vectors for a list of documents."""
        tokenized = []
        df = Counter()
        
        for text in corpus:
            tokens = re.sub(r'[^\w\s]', '', text.lower()).split()
            tokens = [t for t in tokens if len(t) > 2 and t not in self.stopwords]
            tokenized.append(tokens)
            df.update(set(tokens))
            
        N = len(corpus)
        vectors = []
        for tokens in tokenized:
            tf = Counter(tokens)
            vec = {}
            total_terms = max(len(tokens), 1)
            for word, count in tf.items():
                tf_val = count / total_terms
                idf_val = math.log((N + 1) / (df[word] + 1)) + 1
                vec[word] = tf_val * idf_val
            vectors.append(vec)
        return vectors
        
    def _cosine_sim(self, vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
        """Compute cosine similarity between two sparse TF-IDF vectors."""
        intersection = set(vec1.keys()) & set(vec2.keys())
        if not intersection:
            return 0.0
            
        dot = sum(vec1[w] * vec2[w] for w in intersection)
        mag1 = math.sqrt(sum(v**2 for v in vec1.values()))
        mag2 = math.sqrt(sum(v**2 for v in vec2.values()))
        if mag1 == 0 or mag2 == 0:
            return 0.0
        return dot / (mag1 * mag2)
        
    def _agglomerative_clustering(self, dist_matrix: List[List[float]], k: int) -> List[int]:
        """
        Average-linkage agglomerative clustering.
        Returns array of cluster IDs for each item.
        """
        n = len(dist_matrix)
        if n == 0:
            return []
        if n == 1:
            return [0]
            
        # Start with each node in its own cluster
        clusters = {i: [i] for i in range(n)}
        
        while len(clusters) > k:
            min_dist = float('inf')
            merge_pair = None
            
            c_ids = list(clusters.keys())
            for i in range(len(c_ids)):
                for j in range(i + 1, len(c_ids)):
                    id1 = c_ids[i]
                    id2 = c_ids[j]
                    
                    # Compute average linkage distance
                    dist_sum = 0
                    count = 0
                    for n1 in clusters[id1]:
                        for n2 in clusters[id2]:
                            dist_sum += dist_matrix[n1][n2]
                            count += 1
                    
                    if count > 0:
                        avg_dist = dist_sum / count
                        if avg_dist < min_dist:
                            min_dist = avg_dist
                            merge_pair = (id1, id2)
                        
            if not merge_pair:
                break
                
            # Merge clusters
            id1, id2 = merge_pair
            clusters[id1].extend(clusters[id2])
            del clusters[id2]
            
        # Re-index clusters to 0, 1, 2...
        final_assignment = [0] * n
        for new_id, old_id in enumerate(clusters.keys()):
            for node in clusters[old_id]:
                final_assignment[node] = new_id
                
        return final_assignment
