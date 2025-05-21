import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@shared/schema";

interface UserAvatarProps {
  user: User;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ user, size = "md" }: UserAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const fallbackText = user.displayName
    ? user.displayName.substring(0, 2)
    : user.username.substring(0, 2);

  return (
    <Avatar className={sizeClasses[size]}>
      <AvatarImage src={user.profileImage} alt={user.displayName || user.username} />
      <AvatarFallback className="bg-spotify-green text-black">
        {fallbackText.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
