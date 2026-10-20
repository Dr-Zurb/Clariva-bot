package com.haloaid.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Home-screen tile. A tap opens the existing New idea page. Android will not
 * put a text field inside the tile, so the page is where the line is typed.
 */
public class IdeaWidget extends AppWidgetProvider {
    static final String IDEA_URL = "https://haloaid.com/dashboard/social/idea";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            update(context, manager, appWidgetId);
        }
    }

    static void update(Context context, AppWidgetManager manager, int appWidgetId) {
        Intent launch = new Intent(context, LauncherActivity.class);
        launch.setAction(Intent.ACTION_VIEW);
        launch.setData(Uri.parse(IDEA_URL));
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        PendingIntent pending = PendingIntent.getActivity(
                context,
                appWidgetId,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        android.widget.RemoteViews views = new android.widget.RemoteViews(
                context.getPackageName(),
                R.layout.idea_widget);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        manager.updateAppWidget(appWidgetId, views);
    }
}
