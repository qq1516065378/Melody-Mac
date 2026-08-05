import Base from "@renderer/components/Panel/templates/Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import SvgAsset from "@renderer/components/SvgAsset";
import dayjs from "dayjs";
import useComment from "@renderer/components/Panel/templates/MusicComment/useComment";
import { RequestStateCode } from "@/common/constant";
import Loading from "@renderer/components/Loading";
import BottomLoadingState from "@renderer/components/BottomLoadingState";
import classNames from "@/renderer/utils/classnames";

interface IProps {
    coverHeader?: boolean;
    musicItem?: IMusic.IMusicItem;
}

export default function MusicComment(props: IProps) {
    const { coverHeader, musicItem } = props;
    const { t } = useTranslation();

    const [comments, reqState, loadMore, { sortType, switchSortType }] = useComment(musicItem);


    return <Base
        coverHeader={coverHeader}
        width={540}
    >
        <div className="music-comment-panel--header">
            <div className="music-comment-panel--title-container">
                {t("media.media_type_comment")}
            </div>
            <div className="music-comment-panel--sort-tabs">
                <div
                    role="button"
                    className={classNames({
                        "sort-tab-item": true,
                        active: sortType === "hot",
                    })}
                    onClick={() => switchSortType("hot")}
                >
                    热门
                </div>
                <div
                    role="button"
                    className={classNames({
                        "sort-tab-item": true,
                        active: sortType === "new",
                    })}
                    onClick={() => switchSortType("new")}
                >
                    最新
                </div>
            </div>
        </div>
        <div className="music-comment-panel--body-container">
            {(comments.length === 0 && (reqState & RequestStateCode.LOADING)) ? <Loading></Loading> : <>
                {comments.map(comment => <MusicCommentItem key={comment.id} comment={comment}></MusicCommentItem>)}
                {comments.length === 0 && reqState === RequestStateCode.FINISHED ? (
                    <div className="music-comment-panel--empty">暂无评论</div>
                ) : null}
                <BottomLoadingState state={reqState} onLoadMore={loadMore}></BottomLoadingState>
            </>}
        </div>

    </Base>;
}


interface IMusicCommentItemProps {
    comment: IComment.IComment
}

function MusicCommentItem(props: IMusicCommentItemProps) {
    const { comment } = props;

    return <div className="music-comment-panel--comment-item-container">
        <div className="comment-title-container">
            <img className="avatar"
                src={comment.avatar}></img>
            <span>{comment.nickName}</span>
        </div>
        <div className="comment-body-container">
            <span>{comment.comment}</span>
        </div>
        <div className="comment-operations-container">
            {comment.createAt ? <span>{dayjs(comment.createAt).format("YYYY-MM-DD")}</span> : null}
            <div className="thumb-up">
                <SvgAsset iconName="hand-thumb-up"></SvgAsset>
                <span>{comment.like ?? "-"}</span>
            </div>
        </div>
    </div>;
}
