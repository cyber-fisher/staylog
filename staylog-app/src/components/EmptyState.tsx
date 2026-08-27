import { useStaylog } from "../store/staylog";
import { IconBed, IconClipboard, IconPlus, IconSparkle } from "./Icons";

interface Props {
  onAdd?: () => void;
  /** 提供时显示「粘贴订单文本导入」入口 */
  onImport?: () => void;
}

export default function EmptyState({ onAdd, onImport }: Props) {
  const loadDemo = useStaylog((s) => s.loadDemo);
  return (
    <div className="card empty">
      <div className="art"><IconBed width={40} height={40} /></div>
      <h2 className="serif">开始记录你的第一晚</h2>
      <p>宿迹会把每一次入住变成足迹：自动累计常旅客定级进度、在地图上点亮城市、生成年度住宿总结。</p>
      <div className="row">
        {onAdd && (
          <button className="btn btn-primary" onClick={onAdd}>
            <IconPlus width={14} height={14} /> 新增住宿记录
          </button>
        )}
        {onImport && (
          <button className="btn" onClick={onImport}>
            <IconClipboard width={14} height={14} /> 粘贴订单文本导入
          </button>
        )}
        <button className="btn" onClick={loadDemo}>
          <IconSparkle width={14} height={14} /> 载入演示数据看看效果
        </button>
      </div>
    </div>
  );
}