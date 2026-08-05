import { useCallback, useEffect, useRef, useState } from "react";
import { RequestStateCode } from "@/common/constant";
import PluginManager from "@shared/plugin-manager/renderer";

export type CommentSortType = "hot" | "new";

export default function useComment(musicItem: IMusic.IMusicItem) {
    const [comments, setComments] = useState<IComment.IComment[]>([]);
    const [requestStateCode, setRequestStateCode] = useState(RequestStateCode.IDLE);
    const [sortType, setSortType] = useState<CommentSortType>("hot");
    const pageRef = useRef(1);
    const currentMusicItemRef = useRef<IMusic.IMusicItem>(musicItem);
    const sortTypeRef = useRef<CommentSortType>("hot");
    const requestStateRef = useRef(RequestStateCode.IDLE);
    const commentsRef = useRef<IComment.IComment[]>([]);

    // Keep refs in sync
    useEffect(() => {
        requestStateRef.current = requestStateCode;
    }, [requestStateCode]);
    useEffect(() => {
        commentsRef.current = comments;
    }, [comments]);

    const loadMore = useCallback(async () => {
        try {
            if (requestStateRef.current & RequestStateCode.LOADING) {
                return;
            }
            const isFirstPage = commentsRef.current.length === 0;
            setRequestStateCode(
                isFirstPage
                    ? RequestStateCode.PENDING_FIRST_PAGE
                    : RequestStateCode.PENDING_REST_PAGE,
            );

            const item = currentMusicItemRef.current;
            const response = await PluginManager.callPluginDelegateMethod(
                item,
                "getMusicComments",
                item,
                pageRef.current,
                sortTypeRef.current,
            ) as IPlugin.IGetCommentResult | null;

            const finalResponse = response ?? { isEnd: true, data: [] };

            setComments((prev) => prev.concat(finalResponse.data ?? []));
            if (finalResponse.isEnd === false) {
                setRequestStateCode(RequestStateCode.PARTLY_DONE);
                pageRef.current = pageRef.current + 1;
            } else {
                setRequestStateCode(RequestStateCode.FINISHED);
            }
        } catch (e) {
            console.error("[useComment] 获取评论异常", e);
            setRequestStateCode(RequestStateCode.ERROR);
        }
    }, []);

    const switchSortType = useCallback((newSortType: CommentSortType) => {
        if (newSortType === sortTypeRef.current) return;
        sortTypeRef.current = newSortType;
        setSortType(newSortType);
        pageRef.current = 1;
        setComments([]);
        commentsRef.current = [];
        setRequestStateCode(RequestStateCode.IDLE);
        requestStateRef.current = RequestStateCode.IDLE;
        // 重置后立即加载
        setTimeout(() => void loadMore(), 0);
    }, [loadMore]);

    useEffect(() => {
        currentMusicItemRef.current = musicItem;
        pageRef.current = 1;
        sortTypeRef.current = "hot";
        setSortType("hot");
        setComments([]);
        commentsRef.current = [];
        setRequestStateCode(RequestStateCode.IDLE);
        requestStateRef.current = RequestStateCode.IDLE;
        setTimeout(() => void loadMore(), 0);
    }, [musicItem, loadMore]);

    return [comments, requestStateCode, loadMore, { sortType, switchSortType }] as const;
}
