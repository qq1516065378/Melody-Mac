import "./index.scss";
import routers from "./routers";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import camelToSnake from "@/common/camel-to-snake";

export default function SettingView() {
    const [selected, setSelected] = useState(routers[0].id);
    const { t } = useTranslation();

    const intersectionObserverRef = useRef<IntersectionObserver>();
    const bodyContainerRef = useRef<HTMLDivElement>();
    const intersectionRatioRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        intersectionObserverRef.current = new IntersectionObserver(
            (targets) => {
                const ratio = intersectionRatioRef.current;
                targets.forEach((target) => {
                    ratio.set(target.target.id, target.intersectionRatio);
                });
                let maxVal = 0;
                let maxId;
                for (const entry of ratio.entries()) {
                    if (entry[1] > maxVal) {
                        maxId = entry[0];
                        maxVal = entry[1];
                    }
                }
                setSelected(maxId.slice(8));
            },
            {
                root: bodyContainerRef.current,
                threshold: [0, 0.2, 0.8, 1],
            },
        );

        for (const setting of routers) {
            const target = document.getElementById(`setting-${setting.id}`);
            if (target) {
                intersectionObserverRef.current.observe(target);
            }
        }
        return () => {
            document
                .getElementById("page-container")
                ?.classList?.remove("page-container-full-width");

            intersectionObserverRef.current.disconnect();
            intersectionObserverRef.current = null;
            intersectionRatioRef.current.clear();
            intersectionRatioRef.current = null;
        };
    }, []);

    return (
        <div
            id="page-container"
            className="page-container-fw setting-view--container"
        >
            <div className="setting-view--header">
                <h1>{t("app_header.settings")}</h1>
                <div className="setting-view--section-nav">
                    {routers.map((setting) => (
                        <button
                            type="button"
                            key={setting.id}
                            data-selected={selected === setting.id}
                            onClick={() => {
                                document
                                    .getElementById(`setting-${setting.id}`)
                                    ?.scrollIntoView({
                                        behavior: "smooth",
                                    });
                            }}
                        >
                            {t(`settings.section_name.${camelToSnake(setting.id)}`)}
                        </button>
                    ))}
                </div>
            </div>
            <div className="setting-view--body" ref={bodyContainerRef}>
                {routers.map((setting) => {
                    const Component = setting.component as any;

                    return (
                        <div
                            className="setting-view--body-item-container"
                            id={`setting-${setting.id}`}
                            key={setting.id}
                        >
                            <div className="setting-view--body-title">
                                {t(`settings.section_name.${camelToSnake(setting.id)}`)}
                            </div>
                            <div className="setting-view--section-content">
                                <Component></Component>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
