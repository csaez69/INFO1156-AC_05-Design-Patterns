import {
    BadRequestException,
    Body,
    Controller,
    Get,
    NotFoundException,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from "@nestjs/common"
import { PrismaService } from "@/prisma/prisma.service"
import { PostsService } from "@/posts/posts.service"
import { EntityFactory } from "./factories/entity.factory"
import { legacyModerationApi } from "@/posts/legacy-moderation.client"
import {
    AddLikeDto,
    CreateCommentDto,
    CreatePostDto,
    FeedQueryDto,
} from "@/posts/posts.dtos"

@Controller("api/posts")
export class PostsController {
    constructor(
        private readonly postsService: PostsService,
        private readonly prisma: PrismaService,
    ) {}

    @Post()
    async create(@Body() body: CreatePostDto) {
        // Validaciones básicas de entrada
        if (body.title.length < 3 || body.title.length > 120) {
            throw new BadRequestException("Title length must be between 3 and 120")
        }

        const created = await this.postsService.create(body)

        // Eventos y notificaciones delegados
        this.handleSideEffects("post.created", { postId: created.id, title: created.title })

        return {
            ok: true,
            payload: EntityFactory.createPostEntity(created, "default"),
        }
    }

    @Get()
    async findAll() {
        const posts = await this.postsService.findAll()
        return {
            total: posts.length,
            items: posts.map(p => EntityFactory.createPostEntity(p, "default")),
        }
    }

    @Get("feed")
    async getFeed(@Query() query: FeedQueryDto) {
        const mode = query.mode || "latest"

        // Obtenemos los datos con sus relaciones desde el servicio o prisma
        const posts = await this.prisma.post.findMany({
            include: {
                comments: true,
                likes: true,
            },
        })

        // La Factory se encarga de calcular relevancia, tags y metadata
        const entities = posts.map((post) => 
            EntityFactory.createPostEntity(post, mode)
        )

        // Ordenamiento limpio basado en el modo
        const sorted = this.sortPosts(entities, mode)

        return {
            mode,
            count: sorted.length,
            rows: sorted,
        }
    }

    @Get(":id/comments")
    async getComments(@Param("id", ParseIntPipe) id: number) {
        const comments = await this.prisma.comment.findMany({
            where: { postId: id },
            orderBy: { createdAt: "desc" },
        })

        return {
            total_comments: comments.length,
            comments: comments.map(c => EntityFactory.createCommentEntity(c, { pass: true, reason: "direct" })),
        }
    }

    @Post(":id/comments")
    async createComment(
        @Param("id", ParseIntPipe) id: number,
        @Body() body: CreateCommentDto,
    ) {
        const post = await this.postsService.findById(id)
        if (!post) throw new NotFoundException("Post not found")

        // Moderación delegada a la lógica de negocio
        const moderation = legacyModerationApi.review(body.content)
        if (this.isBlocked(moderation)) {
            throw new BadRequestException("Comment blocked by moderation")
        }

        const created = await this.prisma.comment.create({
            data: { postId: id, content: body.content, source: "controller" },
        })

        this.handleSideEffects("comment.created", { postId: id, commentId: created.id })

        return {
            message: "comment_created",
            entity: EntityFactory.createCommentEntity(created, moderation),
        }
    }

    @Post(":id/likes")
    async addLike(
        @Param("id", ParseIntPipe) id: number,
        @Body() body: AddLikeDto,
    ) {
        const like = await this.prisma.like.create({
            data: {
                postId: id,
                reactionType: body.reactionType || "like",
                weight: body.weight || 1,
                source: "controller",
            },
        })

        this.handleSideEffects("like.created", { postId: id, likeId: like.id })

        return {
            success: true,
            like: EntityFactory.createLikeEntity(like),
        }
    }

    // --- MÉTODOS PRIVADOS DE APOYO ---

    private sortPosts(posts: any[], mode: string) {
        const strategy: Record<string, (a: any, b: any) => number> = {
            latest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            mostLiked: (a, b) => b.likesCount - a.likesCount,
            mostCommented: (a, b) => b.commentsCount - a.commentsCount,
            relevance: (a, b) => b.relevanceScore - a.relevanceScore,
        }
        return posts.sort(strategy[mode] || strategy.latest)
    }

    private isBlocked(moderation: any): boolean {
        if (moderation === "BLOCK") return true
        if (typeof moderation === "number") return moderation < 1
        if (typeof moderation === "object") return !moderation.pass
        return false
    }

    private handleSideEffects(event: string, payload: any) {
        console.log(`[event:${event}]`, payload)
        // Aquí irían las llamadas a fakeSendNotification y fakeRecomputeSomething
    }
}