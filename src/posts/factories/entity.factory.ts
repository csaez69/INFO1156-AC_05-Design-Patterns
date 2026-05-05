import { PostEntity } from "@/posts/entities/post.entity"
import { CommentEntity } from "@/posts/entities/comment.entity"
import { LikeEntity } from "@/posts/entities/like.entity"

export class EntityFactory {
    static createPostEntity(post: any, mode: string): PostEntity {
        const likesCount = post.likes.reduce((sum: number, like: any) => sum + like.weight, 0)
        const commentsCount = post.comments.length
        const hoursSinceCreated =
            (Date.now() - new Date(post.createdAt).getTime()) / 36_000_00
        const relevanceScore = likesCount * 2 + commentsCount * 3 - Math.floor(hoursSinceCreated)
        const tags = post.title.split(" ").filter((word: string) => word.length > 4)

        const metadata = {
            likesWeights: post.likes.map((like: any) => like.weight),
            commentLengths: post.comments.map((comment: any) => comment.content.length),
            hourOfCreate: new Date(post.createdAt).getHours(),
        }

        return new PostEntity(
            post.id,
            post.title,
            post.description,
            post.imageUrl,
            post.createdAt,
            post.updatedAt,
            likesCount,
            commentsCount,
            relevanceScore,
            relevanceScore > 20,
            "feed-service",
            tags,
            metadata,
            mode,
        )
    }

    static createCommentEntity(comment: any, moderation: { pass: boolean; reason: string }): CommentEntity {
        return new CommentEntity(
            comment.id,
            comment.postId,
            comment.content,
            comment.createdAt,
            comment.updatedAt,
            comment.source,
            moderation.pass ? "approved" : "blocked",
            comment.content.length > 60 ? 80 : 40,
            false,
            "es",
            { moderation, chars: comment.content.length, source: comment.source },
        )
    }

    static createLikeEntity(like: any): LikeEntity {
        return new LikeEntity(
            like.id,
            like.postId,
            like.reactionType,
            like.weight,
            like.source,
            like.createdAt,
            like.weight > 2 ? "strong" : "normal",
            true,
            { from: "manual", r: like.reactionType },
        )
    }
}